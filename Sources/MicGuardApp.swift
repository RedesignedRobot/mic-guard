import os
import ServiceManagement
import SwiftUI

@main
struct MicGuardApp: App {
    @State private var inputGuard = InputGuard()
    @State private var djiStatus = DJIMicStatus()
    @AppStorage("showNameInMenuBar") private var showNameInMenuBar = false

    init() {
        LoginItem.registerOnFirstLaunch()
    }

    var body: some Scene {
        MenuBarExtra {
            MenuContent(inputGuard: inputGuard, djiStatus: djiStatus)
        } label: {
            Image(systemName: menuBarSymbol)
            if showNameInMenuBar, let name = inputGuard.current?.mic.name {
                Text(name)
            }
        }

        // A plain Window, because openSettings() does nothing in a menu-bar-only app.
        Window("Mic Guard Settings", id: "settings") {
            SettingsView(inputGuard: inputGuard)
        }
        .windowResizability(.contentSize)
        .defaultLaunchBehavior(.suppressed)
    }

    private var menuBarSymbol: String {
        if inputGuard.pausedUntil != nil { return "mic.slash" }
        return inputGuard.current?.mic.tier?.symbol ?? "mic"
    }
}

struct MenuContent: View {
    let inputGuard: InputGuard
    let djiStatus: DJIMicStatus
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Text(status)

        ForEach(InputGuard.groups, id: \.self) { group in
            let inputs = inputGuard.inputs.filter { $0.mic.group == group }
            if !inputs.isEmpty {
                Section(group) {
                    ForEach(inputs) { input in
                        Button((input.id == inputGuard.currentID ? "✓  " : "     ") + input.mic.name) {
                            inputGuard.use(input)
                        }
                        if DJIMicStatus.isReceiver(input.mic) {
                            transmitterRow
                        }
                    }
                }
            }
        }

        if !inputGuard.recent.isEmpty {
            Section("Recent switches") {
                ForEach(inputGuard.recent) { entry in
                    Text("\(entry.date.formatted(date: .omitted, time: .shortened))   \(entry.from ?? "?") → \(entry.to)")
                }
            }
        }

        Divider()

        if inputGuard.pausedUntil != nil {
            Button("Resume Guarding") { inputGuard.resume() }
        } else {
            Menu("Pause Guarding") {
                Button("For 15 Minutes") { inputGuard.pause(minutes: 15) }
                Button("For 1 Hour") { inputGuard.pause(minutes: 60) }
                Button("Until I Resume") { inputGuard.pause(minutes: nil) }
            }
        }
        Button("Open Sound Settings…") {
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.Sound-Settings.extension")!)
        }

        Divider()

        Button("Settings…") {
            NSApp.activate()
            openWindow(id: "settings")
        }
        .keyboardShortcut(",")
        Button("About Mic Guard") {
            NSApp.activate()
            NSApp.orderFrontStandardAboutPanel()
        }
        Button("Quit Mic Guard") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }

    /// Hidden until the receiver has reported once.
    @ViewBuilder private var transmitterRow: some View {
        if let transmitters = djiStatus.transmitters {
            if transmitters.isEmpty {
                Text("     Transmitter off")
            }
            ForEach(transmitters) { transmitter in
                // Menus drop the icon of a Label on a text row, but keep an image inside the Text.
                let name = transmitters.count > 1 ? "Transmitter \(transmitter.number)" : "Transmitter"
                let charging = transmitter.isCharging ? ", charging" : ""
                Text("     \(Image(nsImage: BatteryIcon.image(for: transmitter)))  \(name) \(transmitter.percent)%\(charging)")
            }
        }
    }

    private var status: String {
        switch inputGuard.pausedUntil {
        case nil:
            "Guarding · \(inputGuard.current?.mic.name ?? "no mic")"
        case .distantFuture?:
            "Paused"
        case let until?:
            "Paused until \(until.formatted(date: .omitted, time: .shortened))"
        }
    }
}

enum LoginItem {
    private static let log = Logger(subsystem: "com.local.MicGuard", category: "login")

    static var isEnabled: Bool { SMAppService.mainApp.status == .enabled }

    /// .notFound means no choice was ever made; after that the Settings toggle owns it.
    static func registerOnFirstLaunch() {
        if SMAppService.mainApp.status == .notFound {
            set(true)
        }
        log.notice("login item status: \(SMAppService.mainApp.status.rawValue)")
    }

    static func set(_ enabled: Bool) {
        let service = SMAppService.mainApp
        do {
            if enabled {
                try service.register()
            } else {
                try service.unregister()
            }
        } catch {
            log.error("login item change failed: \(error.localizedDescription, privacy: .public)")
        }
        // Disabled in System Settings > Login Items: only the user can re-allow it there.
        if enabled && service.status == .requiresApproval {
            SMAppService.openSystemSettingsLoginItems()
        }
    }
}
