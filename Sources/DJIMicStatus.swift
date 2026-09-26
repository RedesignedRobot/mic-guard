// Reads the DJI Mic Mini 2 transmitter's battery from its USB receiver.
// The receiver sends DJI's DUML status frames on vendor interface 6. Audio runs on interfaces 1
// and 3, so reading interface 6 never touches the sound path. Protocol notes:
// github.com/usokawa/dji-mic-mo
import AppKit
import IOKit
import IOUSBHost
import Observation
import os
import UserNotifications

private let log = Logger(subsystem: "com.local.MicGuard", category: "dji")

struct Transmitter: Equatable, Identifiable, CustomStringConvertible {
    /// 1 to 4, the slot the transmitter is paired to.
    let number: Int
    /// The receiver's 7-step gauge: 1 is full, 7 is just before the transmitter shuts off.
    /// Each step lasts about 1.5 to 2 hours of DJI's rated 11.5.
    let gauge: Int
    let isCharging: Bool

    /// 6 at step 1, 0 at step 7.
    var bars: Int { 7 - gauge }
    /// The middle of each step's band, rounded to 10%. A step covers about 14%, so an exact figure would look stuck.
    var level: String {
        switch gauge {
        case 1: "Full"
        case 2: "About 80%"
        case 3: "About 60%"
        case 4: "About 50%"
        case 5: "About 40%"
        case 6: "About 20%"
        default: "Almost empty"
        }
    }
    /// DJI Mimo shows its low-battery warning from step 6.
    var isLow: Bool { gauge >= 6 }
    var id: Int { number }
    var description: String { "TX\(number) step \(gauge)/7\(isCharging ? " charging" : "")" }
}

@MainActor @Observable
final class DJIMicStatus {
    /// nil while no receiver is plugged in or it can't be read; empty when every transmitter is off.
    private(set) var transmitters: [Transmitter]?

    private var poll: Task<Void, Never>?
    private var notifications: IONotificationPortRef?
    /// The lowest gauge step already announced per transmitter, cleared once it charges or climbs back to step 4.
    private var warnedGauge: [Int: Int] = [:]
    /// The last step logged per transmitter. Kept across failed reads, so a recovery doesn't log the same step twice.
    private var loggedSteps: [Int: Transmitter] = [:]

    init() {
        watchReceiver()
    }

    /// The Core Audio UID of the receiver's input, as Mic Guard lists it.
    static func isReceiver(_ mic: KnownMic) -> Bool {
        mic.uid.hasPrefix("AppleUSBAudioEngine:DJI Technology Co., Ltd.:Wireless Mic Rx:")
    }

    private func receiverArrived() {
        log.notice("receiver connected")
        poll?.cancel()
        poll = Task {
            var failedReads = 0
            while !Task.isCancelled {
                let reading = await DJIReceiver.read()
                guard !Task.isCancelled else { return }
                if let reading {
                    logChanges(reading)
                    transmitters = reading
                    failedReads = 0
                    warnIfLow(reading)
                } else {
                    // Another tool may hold the interface. Keep the last value for a few reads, not forever.
                    failedReads += 1
                    if failedReads >= 3 { transmitters = nil }
                }
                // A transmitter switched on, or a receiver still booting, shows up within 15 s.
                let connected = !(transmitters ?? []).isEmpty
                try? await Task.sleep(for: .seconds(connected ? 60 : 15))
            }
        }
    }

    /// Notice level, so the step history stays in the log for days: "battery TX1 step 2/7 -> TX1 step 3/7".
    private func logChanges(_ reading: [Transmitter]) {
        for transmitter in reading where loggedSteps[transmitter.number] != transmitter {
            let before = loggedSteps[transmitter.number]?.description ?? "unknown"
            log.notice("battery \(before, privacy: .public) -> \(transmitter.description, privacy: .public)")
            loggedSteps[transmitter.number] = transmitter
        }
    }

    /// One alert at step 6, where DJI Mimo warns, and one more at step 7, just before shutoff.
    private func warnIfLow(_ transmitters: [Transmitter]) {
        for transmitter in transmitters {
            // Re-arm only well above low, so a gauge flickering between 5 and 6 doesn't alert twice.
            if transmitter.isCharging || transmitter.gauge <= 4 {
                warnedGauge[transmitter.number] = nil
            }
            guard transmitter.isLow, !transmitter.isCharging else { continue }
            guard transmitter.gauge > warnedGauge[transmitter.number] ?? 0 else { continue }
            warnedGauge[transmitter.number] = transmitter.gauge
            let name = transmitters.count > 1 ? "DJI transmitter \(transmitter.number)" : "DJI transmitter"
            let body = transmitter.gauge == 7
                ? "It will shut off soon. Charge it or switch mics."
                : "\(transmitter.level) left."
            Self.notify(title: "\(name) battery low", body: body)
        }
    }

    /// Posts only if notifications are already allowed: Mic Guard asks for permission in Settings, not here.
    private static func notify(title: String, body: String) {
        log.notice("\(title, privacy: .public): \(body, privacy: .public)")
        Task {
            let center = UNUserNotificationCenter.current()
            guard await center.notificationSettings().authorizationStatus == .authorized else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            try? await center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
        }
    }

    private func receiverLeft() {
        // Another matching receiver, or a replug whose arrival came first, keeps the poll running.
        let remaining = IOServiceGetMatchingService(kIOMainPortDefault, DJIReceiver.matching())
        if remaining != IO_OBJECT_NULL {
            IOObjectRelease(remaining)
            return
        }
        log.notice("receiver disconnected")
        poll?.cancel()
        poll = nil
        transmitters = nil
        warnedGauge = [:]
    }

    private func watchReceiver() {
        let port = IONotificationPortCreate(kIOMainPortDefault)
        IONotificationPortSetDispatchQueue(port, .main)
        notifications = port
        // The callbacks own a reference, so this object lives as long as the app.
        let context = Unmanaged.passRetained(self).toOpaque()

        var arrivals: io_iterator_t = 0
        IOServiceAddMatchingNotification(port, kIOFirstMatchNotification, DJIReceiver.matching(), { context, iterator in
            guard DJIReceiver.drain(iterator), let context else { return }
            MainActor.assumeIsolated { Unmanaged<DJIMicStatus>.fromOpaque(context).takeUnretainedValue().receiverArrived() }
        }, context, &arrivals)

        var departures: io_iterator_t = 0
        IOServiceAddMatchingNotification(port, kIOTerminatedNotification, DJIReceiver.matching(), { context, iterator in
            guard DJIReceiver.drain(iterator), let context else { return }
            MainActor.assumeIsolated { Unmanaged<DJIMicStatus>.fromOpaque(context).takeUnretainedValue().receiverLeft() }
        }, context, &departures)

        // Draining arms the notifications; a receiver plugged in before launch shows up here.
        _ = DJIReceiver.drain(departures)
        if DJIReceiver.drain(arrivals) {
            receiverArrived()
        }
    }
}

/// Talks to the receiver on its own queue, because USB reads block. Every read opens the interface,
/// listens for up to two seconds and closes it again, so other tools can use the interface between reads.
enum DJIReceiver {
    private static let vendorID = 0x2ca3
    private static let productID = 0x4011  // DJI Mic Mini 2 receiver
    private static let controlInterface = 6
    private static let statusEndpoint = 0x86
    private static let listenTime = Duration.seconds(2)
    private static let queue = DispatchQueue(label: "com.local.MicGuard.dji")

    static func read() async -> [Transmitter]? {
        await withCheckedContinuation { continuation in
            queue.async { continuation.resume(returning: readTransmitters()) }
        }
    }

    static func matching() -> CFMutableDictionary {
        // IOUSBHost only matches an interface number together with its configuration value.
        IOUSBHostInterface.__createMatchingDictionary(
            withVendorID: vendorID as NSNumber, productID: productID as NSNumber, bcdDevice: nil,
            interfaceNumber: controlInterface as NSNumber, configurationValue: 1, interfaceClass: nil,
            interfaceSubclass: nil, interfaceProtocol: nil, speed: nil, productIDArray: nil
        ).takeRetainedValue()
    }

    /// Releases every service in the iterator and reports whether there was one.
    static func drain(_ iterator: io_iterator_t) -> Bool {
        var found = false
        while case let service = IOIteratorNext(iterator), service != IO_OBJECT_NULL {
            IOObjectRelease(service)
            found = true
        }
        return found
    }

    /// nil when the receiver is gone, busy in another tool, or sent no status frame.
    private static func readTransmitters() -> [Transmitter]? {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, matching())
        guard service != IO_OBJECT_NULL else { return nil }
        defer { IOObjectRelease(service) }

        let interface: IOUSBHostInterface
        let pipe: IOUSBHostPipe
        do {
            // No seize option: if dji-mic-mo or another tool holds the interface, skip this read.
            interface = try IOUSBHostInterface(__ioService: service, options: [], queue: nil, interestHandler: nil)
            pipe = try interface.copyPipe(withAddress: statusEndpoint)
        } catch {
            log.info("control interface unavailable: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        defer { interface.destroy() }

        var frames = FrameReader()
        var reading: [Transmitter]?
        let buffer = NSMutableData(length: 512)!
        let clock = ContinuousClock()
        let deadline = clock.now + listenTime
        while clock.now < deadline {
            var count = 0
            let requested = clock.now
            do {
                try pipe.__sendIORequest(with: buffer, bytesTransferred: &count, completionTimeout: 0.5)
            } catch {
                // A timeout between heartbeats takes the full 0.5 s. Anything faster is a real
                // failure, like an unplug mid-read, and retrying would spin.
                if clock.now - requested < .milliseconds(400) {
                    log.info("status read failed: \(error.localizedDescription, privacy: .public)")
                    break
                }
                continue
            }
            frames.append(Data(bytes: buffer.bytes, count: count))
            while let frame = frames.next() {
                guard let transmitters = transmitters(in: frame) else { continue }
                if !transmitters.isEmpty {
                    log.info("transmitters \(String(describing: transmitters), privacy: .public)")
                    return transmitters
                }
                // Right after opening, the receiver can send one frame without the transmitter
                // slots, so keep listening before calling them off.
                reading = transmitters
            }
        }
        log.info("transmitters \(String(describing: reading), privacy: .public)")
        return reading
    }

    /// Decodes a status heartbeat (command set 0x5b, id 0x03, block type 0x03).
    /// nil for every other frame, and for a heartbeat whose only slots have no battery reading.
    private static func transmitters(in frame: [UInt8]) -> [Transmitter]? {
        guard frame[9] == 0x5b, frame[10] == 0x03 else { return nil }
        let data = Array(frame[11..<(frame.count - 2)])
        guard data.count >= 41, data[3] == 0x03 else { return nil }

        // Transmitter slots are 32 bytes from offset 41: tag 0x02, then a one-hot slot bit.
        var slotCount = 0
        var transmitters: [Transmitter] = []
        for slot in stride(from: 41, to: data.count - 31, by: 32) {
            guard data[slot] == 0x02, let number = [0x01, 0x02, 0x04, 0x08].firstIndex(of: data[slot + 1]) else { continue }
            slotCount += 1
            let flags = data[slot + 7]
            let gauge = Int(flags >> 2) & 0x07
            guard (1...7).contains(gauge) else { continue }
            transmitters.append(Transmitter(number: number + 1, gauge: gauge, isCharging: flags & 0x02 != 0))
        }
        if slotCount > 0 && transmitters.isEmpty { return nil }
        return transmitters
    }
}

/// Splits the receiver's byte stream into CRC-checked DUML frames:
/// 0x55, length (10 bits) + version, header CRC-8, ..., CRC-16 over everything before it.
struct FrameReader {
    private var buffer: [UInt8] = []

    mutating func append(_ data: Data) {
        buffer.append(contentsOf: data)
    }

    mutating func next() -> [UInt8]? {
        while let start = buffer.firstIndex(of: 0x55) {
            buffer.removeFirst(start)
            guard buffer.count >= 4 else { return nil }
            guard Self.crc8(buffer[0..<3]) == buffer[3] else {
                buffer.removeFirst()
                continue
            }
            let length = (Int(buffer[1]) | Int(buffer[2]) << 8) & 0x3ff
            guard length >= 13 else {
                buffer.removeFirst()
                continue
            }
            guard buffer.count >= length else { return nil }
            let frame = Array(buffer[0..<length])
            let checksum = UInt16(frame[length - 2]) | UInt16(frame[length - 1]) << 8
            guard Self.crc16(frame[0..<(length - 2)]) == checksum else {
                buffer.removeFirst()
                continue
            }
            buffer.removeFirst(length)
            return frame
        }
        buffer.removeAll()
        return nil
    }

    private static func crc8(_ bytes: ArraySlice<UInt8>) -> UInt8 {
        var crc: UInt8 = 0x77
        for byte in bytes {
            crc ^= byte
            for _ in 0..<8 { crc = crc & 1 != 0 ? (crc >> 1) ^ 0x8c : crc >> 1 }
        }
        return crc
    }

    private static func crc16(_ bytes: ArraySlice<UInt8>) -> UInt16 {
        var crc: UInt16 = 0x3692
        for byte in bytes {
            crc ^= UInt16(byte)
            for _ in 0..<8 { crc = crc & 1 != 0 ? (crc >> 1) ^ 0x8408 : crc >> 1 }
        }
        return crc
    }
}

/// A battery with the receiver's six bars, so the icon shows exactly what the receiver reports.
/// Redrawn on every appearance change, so the outline follows light and dark mode.
enum BatteryIcon {
    static func image(for transmitter: Transmitter) -> NSImage {
        let image = NSImage(size: NSSize(width: 24, height: 12), flipped: false) { _ in
            // The 1-point stroke sits on half points; the bars sit on whole points so they stay sharp at 1x.
            let body = NSRect(x: 0.5, y: 0.5, width: 20, height: 11)
            let outline = NSBezierPath(roundedRect: body, xRadius: 3, yRadius: 3)
            outline.lineWidth = 1
            NSColor.secondaryLabelColor.setStroke()
            outline.stroke()

            let cap = NSRect(x: 21.5, y: 4, width: 2, height: 4)
            NSColor.secondaryLabelColor.setFill()
            NSBezierPath(roundedRect: cap, xRadius: 1, yRadius: 1).fill()

            // Six 2-point bars with 1-point gaps, 17 points wide, 1 point clear of the stroke on each side.
            let inner = NSRect(x: 2, y: 3, width: 17, height: 6)
            fillColor(for: transmitter).setFill()
            guard transmitter.bars > 0 else {
                // Step 7: still on, so draw a sliver instead of an empty battery.
                NSRect(x: inner.minX, y: inner.minY, width: 1, height: inner.height).fill()
                return true
            }
            for bar in 0..<transmitter.bars {
                NSRect(x: inner.minX + CGFloat(bar) * 3, y: inner.minY, width: 2, height: inner.height).fill()
            }
            return true
        }
        image.accessibilityDescription = "Transmitter battery \(transmitter.bars) of 6 bars"
        return image
    }

    private static func fillColor(for transmitter: Transmitter) -> NSColor {
        if transmitter.isCharging { return .systemGreen }
        if transmitter.isLow { return .systemRed }
        return .labelColor
    }
}
