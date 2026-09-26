export const TMDB_WATCH_PROVIDER_DISCOVERY_FIXTURE = {
  results: {
    DE: {
      link: 'https://www.themoviedb.org/movie/11/watch',
      flatrate: [{
        provider_id: 8,
        provider_name: 'Netflix',
        logo_path: '/netflix.png',
        display_priority: 1,
      }],
      free: [{
        provider_id: 100,
        provider_name: 'Example Free',
        logo_path: '/free.png',
        display_priority: 2,
      }],
      ads: [{
        provider_id: 300,
        provider_name: 'Pluto TV',
        logo_path: '/pluto.png',
        display_priority: 3,
      }],
      rent: [{
        provider_id: 9,
        provider_name: 'Prime Video',
        logo_path: '/prime.png',
        display_priority: 4,
      }],
      buy: [{
        provider_id: 9,
        provider_name: 'Prime Video',
        logo_path: '/prime.png',
        display_priority: 4,
      }],
    },
  },
}
