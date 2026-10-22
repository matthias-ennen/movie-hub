// Small public projection of the canonical, independently verified YouTube
// SourceEnvelope, NOT a second provider/badge source. Failure means search.
export const YOUTUBE_VERIFIED_TITLE_ROUTES_URL='/youtube-verified-title-routes.json'
let cached=null
export function loadYoutubeVerifiedTitleRoutes(request=fetch){
  if(request===fetch&&cached)return cached
  const promise=Promise.resolve()
    .then(()=>request(YOUTUBE_VERIFIED_TITLE_ROUTES_URL,{redirect:'error'}))
    .then(async response=>{
      if(!response?.ok)return null
      const data=await response.json()
      return data?.kind==='moviehub-youtube-verified-title-routes'
        &&data?.schemaVersion===1 &&data?.providerId==='youtube'
        &&Array.isArray(data?.entries)&&data.count===data.entries.length
        ?data:null
    })
    .catch(()=>null)
  if(request===fetch)cached=promise
  return promise
}
