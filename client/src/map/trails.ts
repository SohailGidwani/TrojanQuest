import type { Spot, Position } from '../../../shared/types'
import { proximity } from './navigation'
import type { LocationFix } from './navigation'
export interface Clue { match: RegExp; title: string; text: string; hint: string; source: string }
export const tutorial: Clue = { match: /bovard.*(auditorium|administration)/i, title: 'I hold the stage, but I’m not a classroom.', text: 'Find the place where the curtain rises and campus comes together. The promenade will lead you toward the applause.', hint: 'Look for the auditorium on Trousdale Parkway. You don’t need to go inside.', source: 'https://calendar.usc.edu/bovard_auditorium_adm' }
export const trails: { id: string; title: string; teaser: string; key: string; stops: Clue[] }[] = [
 { id:'libraries',title:'Between the pages',teaser:'A first chapter, a quiet corner, and your next favorite study spot.',key:'book',stops:[
  {match:/leavey/i,title:'A new chapter begins where Trojans come to focus.',text:'Find the library that shares its name with Thomas and Dorothy. Your first page is waiting.',hint:'Look for Leavey Library. Discover it from the public path outside.',source:'https://libraries.usc.edu/locations/leavey-library'},
  {match:/doheny/i,title:'Your next chapter has a different cover.',text:'Another library, another perspective. Look for the memorial library named for the Doheny family.',hint:'Find Doheny Memorial Library beside Alumni Park.',source:'https://libraries.usc.edu/locations/doheny-memorial-library'},
 ]},
 {id:'outdoors',title:'Take the long way',teaser:'Close the laptop. Follow a little fresh air across campus.',key:'leaf',stops:[
  {match:/alumni park/i,title:'No walls. No ceiling. A very good study break.',text:'Find the park whose name connects today’s Trojans with those who came before.',hint:'Your next discovery is Alumni Park.',source:'https://calendar.usc.edu/alumni_park_699'},
  {match:/mccarthy quad/i,title:'Four sides, a little fresh air, and a new discovery.',text:'Find the quad named McCarthy, and trade another ordinary shortcut for a campus story.',hint:'Look for McCarthy Quad near Leavey Library.',source:'https://calendar.usc.edu/mccarthy_quad_798'},
 ]},
]
export function nextDiscovery(spots: Spot[], completed: string[], trailId: string | null): {spot:Spot;clue:Clue}|null {
 const first=spots.find(spot=>tutorial.match.test(spot.name))
 if(!first)return null
 if(!completed.includes(first.id))return{spot:first,clue:tutorial}
 const trail=trails.find(item=>item.id===trailId)
 if(!trail)return null
 for(const clue of trail.stops){const spot=spots.find(item=>clue.match.test(item.name));if(!spot)return null;if(!completed.includes(spot.id))return{spot,clue}}
 return null
}
export function nearbyMapVisible(target:Position,fix:LocationFix|null,now=Date.now()){
 const status=proximity(target,fix,now)
 return !!fix && (status.state==='searching'||status.state==='arrived') && status.distance!==null && status.distance+fix.accuracy<=150
}
