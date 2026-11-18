import Foundation
import Security
import CommuteNativeCore

struct NativeCredentials: Codable, Equatable {
    let id: String
    let token: String
    func validate() throws {
        guard !id.isEmpty, id.utf8.count <= 64, !token.isEmpty, token.utf8.count <= 128 else { throw NativeError.invalid }
    }
}

/// The only persistent copy owned by the shell is in this app's Keychain, accessible after first unlock.
struct BoundRegistration: Codable {
    let origin: String
    let credentials: NativeCredentials
}

protocol NativeCredentialStorage {
    func read() throws -> BoundRegistration?
    func write(_ value: NativeCredentials?, origin: String) throws
}

struct NativeCredentialStore: NativeCredentialStorage {
    private let identity: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "uk.cartref.srapley.commute.native-v1",
        kSecAttrAccount as String: "proxy-device"
    ]

    func read() throws -> BoundRegistration? {
        var query = identity
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw NativeError.unavailable }
        return try JSONDecoder().decode(BoundRegistration.self, from: data)
    }

    func write(_ value: NativeCredentials?, origin: String) throws {
        guard let value else {
            let status = SecItemDelete(identity as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeError.unavailable }
            return
        }
        try value.validate()
        let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(BoundRegistration(origin: origin, credentials: value)),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(identity as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(identity.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess else { throw NativeError.unavailable }
        } else if status != errSecSuccess { throw NativeError.unavailable }
    }
}
