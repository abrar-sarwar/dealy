import XCTest
@testable import Dealy

@MainActor
final class SmartBasketTests: XCTestCase {

    private func makeApp(_ store: PreferenceStoring = InMemoryPreferencesStore(),
                         service: SmartBasketServicing = MockSmartBasketService()) -> AppState {
        AppState(store: store,
                 dealService: MockDealService(artificialDelay: .zero),
                 smartBasketService: service,
                 locationProvider: MockLocationProvider())
    }

    // MARK: - Setup → BasketRequest mapping

    func testMakeBasketRequestMapsSelectionsToWireValues() {
        let app = makeApp()
        let request = app.makeBasketRequest(
            goal: .highProtein,
            budgetDollars: 50,
            timeframe: .oneWeek,
            dietary: [.halal, .highProtein]
        )
        XCTAssertEqual(request.budget, 50)
        XCTAssertEqual(request.goal, .highProtein)
        XCTAssertEqual(request.goal.apiValue, "high_protein")
        XCTAssertEqual(request.timeframe.apiValue, "1_week")
        XCTAssertEqual(request.dietary.map { $0.apiValue }, ["halal", "high_protein"])
        XCTAssertTrue(request.allowSecondStop)
        // Coordinates come from the active discovery center.
        XCTAssertEqual(request.latitude, app.discovery.center.latitude)
        XCTAssertEqual(request.longitude, app.discovery.center.longitude)
        XCTAssertEqual(request.maxDistance, app.discovery.radiusMiles)
    }

    func testBasketRequestJSONBodyUsesSnakeCaseWireValues() {
        let app = makeApp()
        let request = app.makeBasketRequest(goal: .mealPrep, budgetDollars: 35, timeframe: .threeDays)
        let body = request.jsonBody
        XCTAssertEqual(body["goal"] as? String, "meal_prep")
        XCTAssertEqual(body["timeframe"] as? String, "3_days")
        XCTAssertEqual(body["budget"] as? Int, 35)
        XCTAssertEqual(body["allowSecondStop"] as? Bool, true)
    }

    // MARK: - Mock generation

    func testMockGenerateReturnsLabeledEstimatedBasket() async throws {
        let app = makeApp()
        let request = app.makeBasketRequest(goal: .highProtein, budgetDollars: 35, timeframe: .threeDays)
        let basket = try await app.generateBasket(request)

        XCTAssertEqual(basket.sourceStatus, .estimated)
        XCTAssertTrue(basket.showsLowDataBanner)
        XCTAssertFalse(basket.items.isEmpty)
        XCTAssertTrue(basket.title.contains("35"))
        XCTAssertNotNil(basket.bestStore)
        // Estimated items are never presented as verified deals.
        XCTAssertTrue(basket.items.allSatisfy { $0.trustLabel == .estimated })
        // Estimated total stays within budget.
        XCTAssertLessThanOrEqual(basket.estimatedTotal, Decimal(35))
    }

    func testMockFoodRunReturnsEnrichedResult() async throws {
        let app = makeApp()
        let request = app.makeFoodRunRequest(goal: .under10)
        let result = try await app.fetchFoodRun(request)
        XCTAssertFalse(result.place.name.isEmpty)
        XCTAssertNotNil(result.estimatedCost)
        // v2 enrichment: tags, alternatives, ranking label, recommended order.
        XCTAssertFalse(result.tags.isEmpty)
        XCTAssertGreaterThanOrEqual(result.alternatives.count, 2)
        XCTAssertEqual(result.rankingLabel, "Best under $10")
        XCTAssertEqual(result.recommendedOrder, "Get the chicken plate")
        XCTAssertNotNil(result.place.distanceMiles)
        XCTAssertEqual(result.sourceStatus, .estimated)
    }

    // MARK: - Setup → FoodRunRequest mapping

    func testMakeFoodRunRequestMapsSelectionsToWireValues() {
        let app = makeApp()
        let request = app.makeFoodRunRequest(
            goal: .quickLunch,
            budgetDollars: 15,
            maxDistanceMiles: 1.5,
            dietary: [.halal, .highProtein],
            timeOfDay: .lunch,
            vibe: .quick,
            allowChains: false,
            allowLocal: true
        )
        XCTAssertEqual(request.goal, .quickLunch)
        XCTAssertEqual(request.budget, 15)
        XCTAssertEqual(request.maxDistanceMiles, 1.5)
        XCTAssertFalse(request.allowChains)
        XCTAssertEqual(request.latitude, app.discovery.center.latitude)

        let body = request.jsonBody
        XCTAssertEqual(body["goal"] as? String, "quick_lunch")
        XCTAssertEqual(body["budget"] as? Int, 15)
        XCTAssertEqual(body["maxDistanceMiles"] as? Double, 1.5)
        XCTAssertEqual(body["dietary"] as? [String], ["halal", "high_protein"])
        XCTAssertEqual(body["timeOfDay"] as? String, "lunch")
        XCTAssertEqual(body["vibe"] as? String, "quick")
        XCTAssertEqual(body["allowChains"] as? Bool, false)
        XCTAssertEqual(body["allowLocal"] as? Bool, true)
    }

    func testFoodRunRequestOmitsAbsentOptionalFields() {
        let app = makeApp()
        let body = app.makeFoodRunRequest(goal: .bestValue).jsonBody
        XCTAssertEqual(body["goal"] as? String, "best_value")
        XCTAssertNil(body["budget"])
        XCTAssertNil(body["maxDistanceMiles"])
        XCTAssertNil(body["dietary"])
        XCTAssertNil(body["timeOfDay"])
        XCTAssertNil(body["vibe"])
    }

    // MARK: - Save / unsave place persistence

    func testSaveAndUnsavePlace() async throws {
        let app = makeApp()
        let result = try await app.fetchFoodRun(app.makeFoodRunRequest(goal: .under10))
        let place = result.place

        XCTAssertFalse(app.isPlaceSaved(place.id))
        app.savePlace(place)
        XCTAssertTrue(app.isPlaceSaved(place.id))
        XCTAssertEqual(app.savedPlaceCount, 1)
        XCTAssertEqual(app.savedPlaces.first?.id, place.id)

        // Saving the same id again replaces (no duplicate).
        app.savePlace(place)
        XCTAssertEqual(app.savedPlaceCount, 1)

        app.removePlace(place.id)
        XCTAssertFalse(app.isPlaceSaved(place.id))
        XCTAssertEqual(app.savedPlaceCount, 0)
    }

    func testSavedPlacesPersistAcrossAppStateInstances() async throws {
        let store = InMemoryPreferencesStore()
        let app = makeApp(store)
        let result = try await app.fetchFoodRun(app.makeFoodRunRequest(goal: .highProtein))
        app.savePlace(result.place)

        let reloaded = makeApp(store)
        XCTAssertTrue(reloaded.isPlaceSaved(result.place.id))
        XCTAssertEqual(reloaded.savedPlaces.first?.name, result.place.name)
        XCTAssertEqual(reloaded.savedPlaces.first?.tags, result.place.tags)
    }

    func testTogglePlaceSaved() async throws {
        let app = makeApp()
        let result = try await app.fetchFoodRun(app.makeFoodRunRequest(goal: .cheapest))
        XCTAssertTrue(app.togglePlaceSaved(result.place))
        XCTAssertTrue(app.isPlaceSaved(result.place.id))
        XCTAssertFalse(app.togglePlaceSaved(result.place))
        XCTAssertFalse(app.isPlaceSaved(result.place.id))
    }

    // MARK: - Save / unsave basket persistence

    func testSaveAndUnsaveBasket() async throws {
        let app = makeApp()
        let basket = try await app.generateBasket(
            app.makeBasketRequest(goal: .cheapest, budgetDollars: 20, timeframe: .today))

        XCTAssertFalse(app.isBasketSaved(basket.id))
        app.saveBasket(basket)
        XCTAssertTrue(app.isBasketSaved(basket.id))
        XCTAssertEqual(app.savedBasketCount, 1)
        XCTAssertEqual(app.savedBaskets.first?.id, basket.id)

        // Saving the same id again replaces (no duplicate).
        app.saveBasket(basket)
        XCTAssertEqual(app.savedBasketCount, 1)

        app.removeBasket(basket.id)
        XCTAssertFalse(app.isBasketSaved(basket.id))
        XCTAssertEqual(app.savedBasketCount, 0)
    }

    func testSavedBasketsPersistAcrossAppStateInstances() async throws {
        let store = InMemoryPreferencesStore()
        let app = makeApp(store)
        let basket = try await app.generateBasket(
            app.makeBasketRequest(goal: .breakfast, budgetDollars: 35, timeframe: .threeDays))
        app.saveBasket(basket)

        // A fresh AppState backed by the same store rehydrates the saved basket.
        let reloaded = makeApp(store)
        XCTAssertTrue(reloaded.isBasketSaved(basket.id))
        XCTAssertEqual(reloaded.savedBaskets.first?.title, basket.title)
        XCTAssertEqual(reloaded.savedBaskets.first?.items.count, basket.items.count)
    }

    func testToggleBasketSaved() async throws {
        let app = makeApp()
        let basket = try await app.generateBasket(
            app.makeBasketRequest(goal: .party, budgetDollars: 75, timeframe: .oneWeek))
        XCTAssertTrue(app.toggleBasketSaved(basket))
        XCTAssertTrue(app.isBasketSaved(basket.id))
        XCTAssertFalse(app.toggleBasketSaved(basket))
        XCTAssertFalse(app.isBasketSaved(basket.id))
    }
}
