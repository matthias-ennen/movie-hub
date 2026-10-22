// Frozen, provenance-checked 100 VIDEO IDs from G1 artifact #12353497700 (2026-10-21).
// Plus 20 G2 Netzkino IDs from run #39737252995. Only used for excluding replayed IDs.
import { NETZKINO_BASELINE_20_VIDEO_IDS } from './youtube-adapter-live-preflight.mjs'
const G1 = ["DRQXgRYOVvo","1fx5l6OqtEo","_GMVva1ccwo","4BRw66-TH4o","5rC7VRkEz4Y","eGLYUSa1XhA","J_llh3_h8dQ","VNDaVrIYH9I","_Cb9zAVoB70","_wbfkLb5TEM","5NkOOUt6I6s","63WbA7slCdg","7O9VkTxxTTI","9N8GxGlz0bA","IxL_x8G1_FU","LHzf_KpCU-g","RrR7rAvdEUE","u_Sf2eOZtiQ","WlzWW8zfJSI","24u6ps_a_c4","2SwHXYoQQeQ","3ivgYkh5Res","3SJO7aaY8r8","4Dy4kWCnXxY","4RCqKX8K83A","6f5O_yR5hUc","9PsAlt9VHQ0","ClLIOYaxXy0","cTympGJiyGo","cVubTPv90f4","DxRslNY7hDw","EBiseL2xAz8","EFRNDiFXTKs","Etlfq9KD78Q","h4Tv29mk4LE","HvrbUMWtRkk","ImYG7I2Z2yM","j5PHSqJ7xl0","Ln4NNpDD5q8","m-hwfIKIb5w","n0AQvakU8VI","n4tAw7v73Cc","PZC6NS-IFCk","q9Gba51rkHw","RLsHxwsFVqY","rRjpz4JDvB8","rSn7jQolX_c","RxhyuyCQq-I","RY32dCRpRvE","rzIyI-OME3M","s0Ez7ljobJc","sL38Hwd0rwY","tGPvABsHlu4","tk1rk-m3hvc","TPSkKEl65sE","unV_jg5B7mI","vA9VaqicDQI","WRZ0-JNo5BE","X83UMdFJkD8","_nDQIzBm8XA","_U8FzTjzInU","-S6FIqg_tmY","0Zv8LNSm6wY","2Cx1UKdTUwo","3tzHKMMcLnE","4lfHs_LPnMs","4WeGjDchgGA","6C0MCTDL2cE","6DOzUXKgvBU","6EAtk75pyBo","6Q7LgfCc5s8","7R109egcXes","8Pcxy-EkyLM","9_D37WQw9ys","91adAdFqLTI","9A22nfAK1V4","aUNP54nfG3Q","b_2GtgORrXg","Bb8vlNmNv4E","Bc05lsBOflM","bPJ_O0jvYYU","BQm3moZ-XI0","bvAbdZbHmhY","c6fiGD2_qyY","cbE2AVWU5lU","CmU_YCcUrMk","cZr6nW18_fs","d_EwPgaRfs0","D0ddTb8wZ3g","een67n2xTg0","ETZ8zVAHsVE","evrOPvOqaG4","F0RN40YSPHA","G1z5HXCRux8","G7HSH88V2es","gBJ6RxbQeek","gNdaVvgEBg0","GSGM2lq6DTM","GY0DDRvUSCI","GZpe-vurymI"]

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
if (G1.length !== 100 || new Set(G1).size !== 100 || G1.some(v => !VIDEO_ID.test(v))) {
  throw new Error('G1 100-ID archive manifest is invalid')
}
export const previouslyReviewedYouTubeIds = Object.freeze(
  [...new Set([...G1, ...NETZKINO_BASELINE_20_VIDEO_IDS])],
)
export const knownG1VideoIds = Object.freeze(G1)
