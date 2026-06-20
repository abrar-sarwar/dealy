import CoreLocation
import Foundation

// MARK: - Contract

/// Coarse authorization state Dealy cares about. We only ever request
/// When-In-Use, so `authorizedAlways` is folded into `authorizedWhenInUse`.
enum LocationAuthorization: Equatable {
    case notDetermined
    case denied
    case restricted
    case authorizedWhenInUse
}

/// Typed failures surfaced to callers; never leak raw Core Location errors.
enum LocationProviderError: Error, Equatable {
    case denied
    case restricted
    case unavailable
    case timeout
}

/// One-shot device-location interface. Main-actor isolated because it bridges
/// `CLLocationManager`, whose delegate callbacks arrive on the main thread.
@MainActor
protocol LocationProviding: AnyObject {
    var authorization: LocationAuthorization { get }
    func requestWhenInUseAuthorization() async -> LocationAuthorization
    func currentCenter() async throws -> DiscoveryCenter
}

// MARK: - Core Location implementation

/// Bridges `CLLocationManager` to async/await with checked continuations.
/// Requests only When-In-Use authorization and a single location fix.
@MainActor
final class CoreLocationProvider: NSObject, LocationProviding, CLLocationManagerDelegate {
    /// One-shot fixes older than this are rejected as stale.
    private static let maxLocationAge: TimeInterval = 60
    /// Hard ceiling on how long a fix may take before we give up.
    private static let timeout: TimeInterval = 12

    private let manager: CLLocationManager
    private var authContinuation: CheckedContinuation<LocationAuthorization, Never>?
    private var locationContinuation: CheckedContinuation<DiscoveryCenter, Error>?
    private var timeoutTask: Task<Void, Never>?

    init(manager: CLLocationManager = CLLocationManager()) {
        self.manager = manager
        super.init()
        manager.delegate = self
    }

    var authorization: LocationAuthorization {
        Self.map(manager.authorizationStatus)
    }

    func requestWhenInUseAuthorization() async -> LocationAuthorization {
        let status = manager.authorizationStatus
        guard status == .notDetermined else { return Self.map(status) }
        return await withCheckedContinuation { continuation in
            authContinuation = continuation
            manager.requestWhenInUseAuthorization()
        }
    }

    func currentCenter() async throws -> DiscoveryCenter {
        switch manager.authorizationStatus {
        case .denied:
            throw LocationProviderError.denied
        case .restricted:
            throw LocationProviderError.restricted
        case .notDetermined:
            let granted = await requestWhenInUseAuthorization()
            switch granted {
            case .authorizedWhenInUse: break
            case .restricted: throw LocationProviderError.restricted
            default: throw LocationProviderError.denied
            }
        case .authorizedWhenInUse, .authorizedAlways:
            break
        @unknown default:
            throw LocationProviderError.unavailable
        }

        return try await withCheckedThrowingContinuation { continuation in
            locationContinuation = continuation
            startTimeout()
            manager.requestLocation()
        }
    }

    // MARK: Continuation plumbing

    /// Resumes the pending location continuation at most once, cancelling the
    /// timeout. Subsequent delegate callbacks become no-ops.
    private func finishLocation(_ result: Result<DiscoveryCenter, Error>) {
        timeoutTask?.cancel()
        timeoutTask = nil
        guard let continuation = locationContinuation else { return }
        locationContinuation = nil
        continuation.resume(with: result)
    }

    private func startTimeout() {
        timeoutTask?.cancel()
        timeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.timeout * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.finishLocation(.failure(LocationProviderError.timeout))
        }
    }

    // MARK: CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        guard status != .notDetermined, let continuation = authContinuation else { return }
        authContinuation = nil
        continuation.resume(returning: Self.map(status))
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            finishLocation(.failure(LocationProviderError.unavailable))
            return
        }
        // Reject obviously invalid or stale fixes.
        guard location.horizontalAccuracy >= 0,
              abs(location.timestamp.timeIntervalSinceNow) <= Self.maxLocationAge else {
            finishLocation(.failure(LocationProviderError.unavailable))
            return
        }
        finishLocation(.success(DiscoveryCenter(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            displayName: "Current location",
            source: .device
        )))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let clError = error as? CLError, clError.code == .denied {
            finishLocation(.failure(LocationProviderError.denied))
        } else {
            finishLocation(.failure(LocationProviderError.unavailable))
        }
    }

    private static func map(_ status: CLAuthorizationStatus) -> LocationAuthorization {
        switch status {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        case .restricted: return .restricted
        case .authorizedWhenInUse, .authorizedAlways: return .authorizedWhenInUse
        @unknown default: return .denied
        }
    }
}

// MARK: - Deterministic mock

/// Test/preview double with a fixed authorization state and result.
@MainActor
final class MockLocationProvider: LocationProviding {
    var authorization: LocationAuthorization
    private let result: Result<DiscoveryCenter, LocationProviderError>

    // nonisolated so it can be used as a default dependency value from any context.
    nonisolated init(
        authorization: LocationAuthorization = .authorizedWhenInUse,
        result: Result<DiscoveryCenter, LocationProviderError> = .success(
            DiscoveryCenter(
                latitude: 33.7531,
                longitude: -84.3857,
                displayName: "Current location",
                source: .device
            )
        )
    ) {
        self.authorization = authorization
        self.result = result
    }

    func requestWhenInUseAuthorization() async -> LocationAuthorization {
        authorization
    }

    func currentCenter() async throws -> DiscoveryCenter {
        try result.get()
    }
}
