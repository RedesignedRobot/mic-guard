// Keeps the default input on the best mic present.
// Preferred mics first, then wired, built-in, Bluetooth. Virtual devices and "Never use" mics are never chosen.
import CoreAudio
import Foundation
import Observation
import os
import UserNotifications

enum Tier: Int, CaseIterable, Codable {
    case wired, builtIn, bluetooth

    var title: String {
        switch self {
        case .wired: "Wired"
        case .builtIn: "Built-in"
        case .bluetooth: "Bluetooth"
        }
    }

    var symbol: String {
        switch self {
        case .wired: "mic.fill"
        case .builtIn: "mic"
        case .bluetooth: "headphones"
        }
    }

    /// nil for virtual, aggregate, AirPlay and Continuity devices.
    init?(_ device: AudioHardwareDevice) {
        guard let transport = try? device.transportType else { return nil }
        switch transport {
        case kAudioDeviceTransportTypeBuiltIn:
            // The headset jack is built-in transport too, but it's a mic someone plugged in.
            let uid = (try? device.uid) ?? ""
            self = uid.contains("Headphone") ? .wired : .builtIn
        case kAudioDeviceTransportTypeUSB, kAudioDeviceTransportTypeThunderbolt,
             kAudioDeviceTransportTypeFireWire, kAudioDeviceTransportTypePCI,
             kAudioDeviceTransportTypeHDMI, kAudioDeviceTransportTypeDisplayPort,
             kAudioDeviceTransportTypeAVB:
            self = .wired
        case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE:
            self = .bluetooth
        default:
            return nil
        }
    }
}

enum Rule: String, CaseIterable, Codable {
    case prefer, automatic, never

    var title: String {
        switch self {
        case .prefer: "Always prefer"
        case .automatic: "Automatic"
        case .never: "Never use"
        }
    }
}

/// A mic Mic Guard has seen, remembered by UID so rules survive unplugging.
struct KnownMic: Codable, Identifiable {
    let uid: String
    var name: String
    var tier: Tier?
    var rule: Rule
    var id: String { uid }

    /// Lower is better; nil means never switch to it.
    var rank: Int? {
        switch rule {
        case .prefer: 0
        case .never: nil
        case .automatic: tier.map { $0.rawValue + 1 }
        }
    }

    var group: String? {
        switch rule {
        case .prefer: "Preferred"
        case .never: "Never used"
        case .automatic: tier?.title
        }
    }
}

struct Input: Identifiable {
    let id: AudioObjectID
    let mic: KnownMic
}

struct Switch: Identifiable {
    let id = UUID()
    let date: Date
    let from: String?
    let to: String
}

private let log = Logger(subsystem: "com.local.MicGuard", category: "guard")
private let knownMicsKey = "knownMics"

/// Core Audio calls this on the main queue whenever the device list or default input changes.
private struct Listener: PropertyListenerDelegate {
    let onChange: @Sendable () -> Void
    func propertiesChanged(properties: [AudioObjectPropertyAddress]) { onChange() }
}

@MainActor @Observable
final class InputGuard {
    static let groups = ["Preferred", "Wired", "Built-in", "Bluetooth", "Never used"]

    /// Connected inputs, best first.
    private(set) var inputs: [Input] = []
    private(set) var currentID: AudioObjectID?
    /// nil = enforcing, .distantFuture = paused until resumed.
    private(set) var pausedUntil: Date?
    private(set) var recent: [Switch] = []
    private(set) var knownMics: [String: KnownMic] = [:]

    private let system = AudioHardwareSystem.shared
    private var pendingEnforce: Task<Void, Never>?
    private var pauseTimer: Task<Void, Never>?

    init() {
        if let data = UserDefaults.standard.data(forKey: knownMicsKey),
           let saved = try? JSONDecoder().decode([String: KnownMic].self, from: data) {
            knownMics = saved
        }
        let changes = [
            kAudioHardwarePropertyDevices,
            kAudioHardwarePropertyDefaultInputDevice,
            kAudioHardwarePropertyServiceRestarted,
        ].map { PropertyAddress($0) }
        system.delegates = [Listener { [weak self] in Task { @MainActor in self?.scheduleEnforce() } }]
        do {
            try system.addListener(forProperties: changes, dispatchQueue: .main)
        } catch {
            log.error("listener registration failed: \(error.localizedDescription, privacy: .public)")
        }
        log.info("started")
        enforce()
    }

    var current: Input? { inputs.first { $0.id == currentID } }

    func isConnected(_ mic: KnownMic) -> Bool {
        inputs.contains { $0.mic.uid == mic.uid }
    }

    // MARK: User actions

    func pause(minutes: Int?) {
        pauseTimer?.cancel()
        let until = minutes.map { Date.now.addingTimeInterval(TimeInterval($0 * 60)) } ?? .distantFuture
        pausedUntil = until
        guard until != .distantFuture else { return }
        pauseTimer = Task {
            try? await Task.sleep(until: .now + .seconds(until.timeIntervalSinceNow))
            guard !Task.isCancelled else { return }
            resume()
        }
    }

    func resume() {
        pauseTimer?.cancel()
        pausedUntil = nil
        enforce()
    }

    /// Switches now. A mic the guard would undo pauses the guard for an hour instead.
    func use(_ input: Input) {
        let bestRank = inputs.compactMap(\.mic.rank).min()
        if let bestRank, input.mic.rank.map({ $0 > bestRank }) ?? true {
            pause(minutes: 60)
        }
        setInput(input, reason: nil)
    }

    func setRule(_ rule: Rule, for uid: String) {
        knownMics[uid]?.rule = rule
        save()
        enforce()
    }

    func forget(_ uid: String) {
        knownMics[uid] = nil
        save()
    }

    // MARK: Enforcement

    /// Connecting a device fires several notifications in a burst; act once they settle.
    private func scheduleEnforce() {
        pendingEnforce?.cancel()
        pendingEnforce = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            enforce()
        }
    }

    private func enforce() {
        // Read each device once: a device can vanish mid-pass, and a second read would disagree.
        inputs = inputDevices().compactMap(remember)
            .sorted { ($0.mic.rank ?? .max) < ($1.mic.rank ?? .max) }
        currentID = (try? system.defaultInputDevice)?.id

        guard pausedUntil == nil else { return }
        guard let best = inputs.first(where: { $0.mic.rank != nil }) else { return }
        // Within the best rank, a mic the user picked stays picked.
        guard current?.mic.rank != best.mic.rank else { return }
        setInput(best, reason: current?.mic.name)
    }

    /// `reason` is the mic being replaced when the guard itself switches; nil for a manual pick.
    private func setInput(_ input: Input, reason replaced: String?) {
        do {
            try system.setDefaultInputDevice(AudioHardwareDevice(id: input.id))
        } catch {
            log.error("failed to set input to \(input.mic.name, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return
        }
        currentID = input.id
        log.notice("input -> \(input.mic.name, privacy: .public)")
        guard let replaced else { return }
        recent.insert(Switch(date: .now, from: replaced, to: input.mic.name), at: 0)
        recent = Array(recent.prefix(5))
        notify(from: replaced, to: input.mic.name)
    }

    private func inputDevices() -> [AudioHardwareDevice] {
        let devices = (try? system.devices) ?? []
        return devices.filter { device in
            let isHidden = (try? device.isHidden) ?? true
            let hasInput = ((try? device.streams) ?? []).contains { (try? $0.direction) == .input }
            return !isHidden && hasInput
        }
    }

    /// Records the device in `knownMics` and returns it as an input. Virtual devices are skipped
    /// unless the user already set a rule for them.
    private func remember(_ device: AudioHardwareDevice) -> Input? {
        guard let uid = try? device.uid else { return nil }
        let tier = Tier(device)
        guard tier != nil || knownMics[uid] != nil else { return nil }

        var mic = knownMics[uid] ?? KnownMic(uid: uid, name: "", tier: tier, rule: .automatic)
        mic.name = displayName(device)
        mic.tier = tier
        if knownMics[uid]?.name != mic.name || knownMics[uid]?.tier != mic.tier {
            knownMics[uid] = mic
            save()
        }
        return Input(id: device.id, mic: mic)
    }

    /// Adds the brand when the device name lacks it: "Wireless Mic Rx" becomes "DJI Wireless Mic Rx".
    private func displayName(_ device: AudioHardwareDevice) -> String {
        let name = (try? device.name) ?? "Unknown"
        let manufacturer = (try? device.manufacturer) ?? ""
        guard let brand = manufacturer.split(separator: " ").first.map(String.init),
              !brand.hasPrefix("Apple"), !name.localizedCaseInsensitiveContains(brand) else { return name }
        return "\(brand) \(name)"
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(knownMics) else { return }
        UserDefaults.standard.set(data, forKey: knownMicsKey)
    }

    private func notify(from: String, to: String) {
        guard UserDefaults.standard.bool(forKey: "notifyOnSwitch") else { return }
        let content = UNMutableNotificationContent()
        content.title = "Switched to \(to)"
        content.body = "Moved the input off \(from)."
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
