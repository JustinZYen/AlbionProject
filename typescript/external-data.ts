import {doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; 
import {db} from "./firebaseScripts.js";

const nameToID = (await getDoc(doc(db,"General/Item Data/Name Conversions/Name To ID"))).data();
const idToName = (await getDoc(doc(db,"General/Item Data/Name Conversions/ID To Name"))).data();
// Needs two objects because firebase cannot store all the recipe paths at the same directory with free tier
const recipesWithT = (await getDoc(doc(db,"General/Item Data/Items/PathsWithT"))).data();
const recipesWithoutT = (await getDoc(doc(db,"General/Item Data/Items/PathsWithoutT"))).data();
const itemsJSON = await (await fetch("https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json")).json();
const names = Object.keys(nameToID);

export {nameToID,idToName,recipesWithT,recipesWithoutT,itemsJSON,names};