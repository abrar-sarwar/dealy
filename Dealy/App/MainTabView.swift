import SwiftUI

/// Native five-tab root. Each tab owns its own navigation state.
struct MainTabView: View {
    @State private var router = TabRouter()

    var body: some View {
        TabView(selection: $router.selection) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(AppTab.home)

            ExploreView()
                .tabItem { Label("Explore", systemImage: "magnifyingglass") }
                .tag(AppTab.explore)

            SavedView()
                .tabItem { Label("Saved", systemImage: "heart.fill") }
                .tag(AppTab.saved)

            DealyPlusView()
                .tabItem { Label("Dealy+", systemImage: "crown.fill") }
                .tag(AppTab.plus)

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
                .tag(AppTab.profile)
        }
        .environment(router)
    }
}
