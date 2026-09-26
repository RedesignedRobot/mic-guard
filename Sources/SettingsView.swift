import SwiftUI
import UserNotifications

struct SettingsView: View {
    let inputGuard: InputGuard

    var body: some View {
        TabView {
            Tab("General", systemImage: "gearshape") {
                GeneralSettings(inputGuard: inputGuard)
            }
            Tab("Microphones", systemImage: "mic") {
                MicrophoneSettings(inputGuard: inputGuard)
            }
        }
        .frame(width: 520)
        .tint(Color(red: 0.19, green: 0.82, blue: 0.35))
    }
}

private struct GeneralSettings: View {
    let inputGuard: InputGuard
    @State private var opensAtLogin = LoginItem.isEnabled
    @AppStorage("showNameInMenuBar") private var showNameInMenuBar = false
    @AppStorage("notifyOnSwitch") private var notifyOnSwitch = false

    var body: some View {
        Form {
            Section {
                Toggle("Guard the input device", isOn: Binding(
                    get: { inputGuard.pausedUntil == nil },
                    set: { $0 ? inputGuard.resume() : inputGuard.pause(minutes: nil) }
                ))
                Toggle("Open at login", isOn: Binding(
                    get: { opensAtLogin },
                    set: { LoginItem.set($0); opensAtLogin = LoginItem.isEnabled }
                ))
            }
            Section {
                Toggle("Show the mic name in the menu bar", isOn: $showNameInMenuBar)
                Toggle("Notify me when Mic Guard switches", isOn: Binding(
                    get: { notifyOnSwitch },
                    set: { enabled in
                        notifyOnSwitch = enabled
                        if enabled {
                            Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert]) }
                        }
                    }
                ))
            }
        }
        .formStyle(.grouped)
        .safeAreaInset(edge: .bottom) { AboutFooter() }
        .onAppear { opensAtLogin = LoginItem.isEnabled }
    }
}

private struct MicrophoneSettings: View {
    let inputGuard: InputGuard

    var body: some View {
        Form {
            Section {
                ForEach(mics) { mic in
                    MicRow(mic: mic, connected: inputGuard.isConnected(mic), inputGuard: inputGuard)
                }
            } header: {
                Text("Mic Guard picks the first connected mic in this order: Always prefer, then wired, built-in and Bluetooth. It never switches to a mic set to Never use.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 4)
            }
        }
        .formStyle(.grouped)
        .frame(minHeight: 320)
    }

    /// Connected mics first, then by the order the guard would pick them.
    private var mics: [KnownMic] {
        inputGuard.knownMics.values.sorted {
            let lhs = (inputGuard.isConnected($0) ? 0 : 1, $0.rank ?? .max, $0.name)
            let rhs = (inputGuard.isConnected($1) ? 0 : 1, $1.rank ?? .max, $1.name)
            return lhs < rhs
        }
    }
}

private struct MicRow: View {
    let mic: KnownMic
    let connected: Bool
    let inputGuard: InputGuard

    var body: some View {
        HStack {
            Image(systemName: mic.tier?.symbol ?? "waveform")
                .foregroundStyle(connected ? Color.accentColor : .secondary)
                .frame(width: 20)
            VStack(alignment: .leading) {
                Text(mic.name)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Picker("Rule", selection: Binding(get: { mic.rule }, set: { inputGuard.setRule($0, for: mic.uid) })) {
                ForEach(Rule.allCases, id: \.self) { Text($0.title) }
            }
            .labelsHidden()
            .fixedSize()
        }
        .contextMenu {
            if !connected {
                Button("Forget This Mic") { inputGuard.forget(mic.uid) }
            }
        }
    }

    private var detail: String {
        let kind = mic.tier?.title ?? "Virtual"
        return connected ? "\(kind) · Connected" : "\(kind) · Not connected"
    }
}

private struct AboutFooter: View {
    private let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""

    var body: some View {
        HStack(spacing: 12) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text("Mic Guard \(version)").font(.headline)
                Text("Built by Amir Ayub. Free and open source.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Link("GitHub", destination: URL(string: "https://github.com/RedesignedRobot/mic-guard")!)
        }
        .padding(20)
    }
}
