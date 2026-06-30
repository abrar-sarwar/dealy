import SwiftUI

/// Native five-tab root. Each tab owns its own navigation state.
struct MainTabView: View {
    @State private var router = TabRouter()

    init() {
        // Solid (opaque) tab bar so the map never shows through it — no translucent
        // overlay of the map behind Home/Explore/Map/Saved/Profile.
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(Theme.background)
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some View {
        TabView(selection: $router.selection) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(AppTab.home)
                .solidTabBar()

            ExploreView()
                .tabItem { Label("Explore", systemImage: "magnifyingglass") }
                .tag(AppTab.explore)
                .solidTabBar()

            // Center tab: the Dealy+ map preview.
            DealsMapView()
                .tabItem { Label("Map", systemImage: "map.fill") }
                .tag(AppTab.map)
                .solidTabBar()

            SavedView()
                .tabItem { Label("Saved", systemImage: "heart.fill") }
                .tag(AppTab.saved)
                .solidTabBar()

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
                .tag(AppTab.profile)
                .solidTabBar()
        }
        .environment(router)
    }
}

private extension View {
    /// Solid, opaque tab-bar background so the map (or any content) never shows
    /// through the bar.
    func solidTabBar() -> some View {
        self
            .toolbarBackground(Theme.background, for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
    }
}
