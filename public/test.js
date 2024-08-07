"use strict";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; 
import {db} from "./firebaseScripts.js";
class DateEnum {
    static OLD = Symbol("Old Prices");
    static NEW = Symbol("New Prices");
}

class CraftTypeEnum {
    static REFINING = Symbol("Refining");
    static CRAFTING = Symbol("Crafting")
}
const nameToID = (await getDoc(doc(db,"General/Item Data/Name Conversions/Name To ID"))).data();
const idToName = (await getDoc(doc(db,"General/Item Data/Name Conversions/ID To Name"))).data();
// Needs two objects because firebase cannot store all the recipe paths at the same directory with free tier
const recipesWithT = (await getDoc(doc(db,"General/Item Data/Items/PathsWithT"))).data();
const recipesWithoutT = (await getDoc(doc(db,"General/Item Data/Items/PathsWithoutT"))).data();
const itemsJSON = await (await fetch("https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json")).json();
const names = Object.keys(nameToID);
// HashMap of all Items so far (for saving prices)
// Uses priceIds as keys
const checkedItems = new Map(); 
// HashMap of all the ItemBoxes that correspond to a certain item
// Uses priceIds as keys and an ItemBox array as value
const itemBoxes = new Map();

// Hardcoding city crafting bonuses
const cityBonuses = new Map([
    ["Caerleon",new Map([
        [CraftTypeEnum.REFINING,],
        [CraftTypeEnum.CRAFTING,]
    ])], 
    ["Bridgewatch",new Map([
        [CraftTypeEnum.REFINING,],
        [CraftTypeEnum.CRAFTING,]
    ])], 
    ["Fort Sterling",new Map([
        [CraftTypeEnum.REFINING,],
        [CraftTypeEnum.CRAFTING,]
    ])],
    ["Lymhurst",new Map([
        [CraftTypeEnum.REFINING,],
        [CraftTypeEnum.CRAFTING,]
    ])], 
    ["Martlock",new Map([
        [CraftTypeEnum.REFINING,],
        [CraftTypeEnum.CRAFTING,]
    ])], 
    ["Thetford",new Map([
        [CraftTypeEnum.REFINING,],
        [CraftTypeEnum.CRAFTING,]
    ])], 
    ["Brecilien",new Map([
        [CraftTypeEnum.REFINING,],
        [CraftTypeEnum.CRAFTING,]
    ])], 
]);
class Item {
    priceInfos = new Map([
        [DateEnum.OLD,new PriceInfo()],
        [DateEnum.NEW,new PriceInfo()]
    ]);
    overridePrice = -1;
    tier = NaN;
    enchantment = 0;
    id;
    priceId;
    // Recipes will be array of Recipe objects
    recipes = [];
    category;
    subcategory
    constructor(priceId) {
        this.priceId = priceId;
        this.id = Item.getBaseId(priceId);
        this.#setTier();
        this.#setEnchantment();
        this.#setRecipesAndCategories();
    }

    #setTier() {
        const secondValue = parseInt(this.id.charAt(1));
        if (this.id.charAt(0) === "T" && secondValue != NaN) {
            this.tier = secondValue;
        } else {
            console.log(`Id ${this.priceId} has no tier found`);
        }
    }

    #setEnchantment() {
        const lastVal = parseInt(this.priceId.charAt(this.priceId.length-1));
        if (!isNaN(lastVal) && this.priceId.charAt(this.priceId.length-2) == "@") {
            this.enchantment = lastVal;
        }
    }

    #setRecipesAndCategories() {
        let path;
        if (this.id.charAt(0)=="T") {
            path = recipesWithT[this.id];
        } else {
            path = recipesWithoutT[this.id];
        }
        if (path == null) {
            console.log(`No path found for id ${this.id}`);
            return;
        }
        let itemInfo = itemsJSON;
        for (const pathElement of path) {
            itemInfo = itemInfo[pathElement];
        }
        //console.log(itemInfo);
        
        this.category = itemInfo["@shopcategory"];

        this.subcategory = itemInfo["@shopsubcategory1"];
        if (itemInfo.hasOwnProperty("enchantments") && this.enchantment > 0) {
            itemInfo = itemInfo.enchantments.enchantment[this.enchantment-1];
        }
        if (!itemInfo.hasOwnProperty("craftingrequirements")) {
            console.log(`ID ${this.id} cannot be crafted`);
            return;
        }
        let craftingRequirements = itemInfo.craftingrequirements;
        // Add a recipe based on the contents of craftingrequirements
        const addRecipe= element => {
            //console.log(`id: ${this.id}, addRecipe element: ${JSON.stringify(element)}`);
            if (element.hasOwnProperty("craftresource")) {
                let craftResource = element.craftresource;
                if (!Array.isArray(craftResource)) {
                    craftResource = [craftResource];
                }
                //console.log(`craftresource used to add to recipe: ${craftResource}`);
                let currentRecipe = new Recipe(element["@craftingfocus"],element["@silver"],element["@time"],craftResource);
                if (element.hasOwnProperty("@amountcrafted")) {
                    currentRecipe.amount = element["@amountcrafted"];
                }
                this.recipes.push(currentRecipe);
            }
        }
        if (Array.isArray(craftingRequirements)) {
            for (const craftingRequirement of craftingRequirements) {
                addRecipe(craftingRequirement);
            }
        } else {
            addRecipe(craftingRequirements);
        }
        
        // Item id must end with @number
        if (itemInfo.hasOwnProperty("upgraderequirements")) {
            //let upgradeRequirements = itemInfo.upgraderequirements;
            let previousId;
            if (this.enchantment === 1) {
                previousId = this.priceId.slice(0,-2);
            } else {
                previousId = this.priceId.slice(0,-1)+(this.enchantment-1);
            }
            let initialRecipe = new Recipe(0,0,0,[itemInfo.upgraderequirements.upgraderesource]);
            
            initialRecipe.addResource(previousId,1);
            this.recipes.push(initialRecipe);
        }
    }

    toString() {
        function mapStringify(map) {
            let returnString = "";
            map.forEach((value,key)=>{
                console.log(key);
                returnString+=`City: ${key}, Average price: ${value}`;
            })
            return returnString;
        }
        //let oldPriceData = mapStringify(this.priceInfos.get(DateEnum.OLD).price);
        //let newPriceData = mapStringify(this.priceInfos.get(DateEnum.NEW).price);
        let oldPriceData = Array.from(this.priceInfos.get(DateEnum.OLD).price);
        let newPriceData = Array.from(this.priceInfos.get(DateEnum.NEW).price);
        return `name: ${idToName[Item.getPriceId(this.id)]}, id: ${this.id}, category: ${this.category}, subcategory: ${this.subcategory} tier: ${this.tier}, enchantment: ${this.enchantment}, old price: ${oldPriceData}, new price: ${newPriceData}`;
    }

    static getPriceId(s) {
        if (s.endsWith("LEVEL",s.length-1)) {
            // Convert resources ending with LEVEL# (T4_PLANKS_LEVEL1) to LEVEL#@# (T4_PLANKS_LEVEL1@1)
            // Add exceptions for FISHSAUCE and ALCHEMY_EXTRACT
            if (!s.startsWith("FISHSAUCE",3) && !s.startsWith("ALCHEMY_EXTRACT",3)) {
                return s+"@"+s.charAt(s.length-1);
            }
        } 
        else if (s.startsWith("RANDOM_DUNGEON",3)) {
            const lastValue = parseInt(s.charAt(s.length-1));
            if (lastValue > 1) {
                return s+"@"+(lastValue-1);
            }
        }
        else if (s.startsWith("UNIQUE_LOOTCHEST_COMMUNITY") && s.endsWith("PREMIUM")) {
            return s+"@1";
        }
        // Cover edge cases
        const enchantedMounts = [
            "T8_MOUNT_MAMMOTH_BATTLE",
            "T8_MOUNT_HORSE_UNDEAD",
            "T5_MOUNT_COUGAR_KEEPER",
            "T8_MOUNT_COUGAR_KEEPER",
            "T8_MOUNT_ARMORED_HORSE_MORGANA",
            "T8_MOUNT_RABBIT_EASTER_DARK"
        ];
        if(enchantedMounts.includes(s)) {
            return s+"@1";
        }
        const enchantedDeco1 = [
            "UNIQUE_FURNITUREITEM_TELLAFRIEND_CHEST_A",
            "UNIQUE_FURNITUREITEM_TELLAFRIEND_CHEST_B",
            "UNIQUE_FURNITUREITEM_TELLAFRIEND_CHEST_C",
            "UNIQUE_FURNITUREITEM_TELLAFRIEND_CHEST_COMPANION",
            "UNIQUE_FURNITUREITEM_TELLAFRIEND_CHEST_BARREL",
            "UNIQUE_FURNITUREITEM_TELLAFRIEND_CHEST_MERLINCUBE",
            "UNIQUE_FURNITUREITEM_TELLAFRIEND_CHEST_BARREL_B",
            "UNIQUE_FURNITUREITEM_MORGANA_TORCH_C",
            "UNIQUE_FURNITUREITEM_MORGANA_FIREBOWL_C"
        ];
        if (enchantedDeco1.includes(s)) {
            return s+"@1";
        }
        const enchantedDeco2 = [
            "UNIQUE_FURNITUREITEM_MORGANA_CAMPFIRE_D",
            "UNIQUE_FURNITUREITEM_MORGANA_SIEGE_BALLISTA_A",
            "UNIQUE_FURNITUREITEM_MORGANA_WEAPONCRATE_A"
        ];
        if (enchantedDeco2.includes(s)) {
            return s+"@2";
        }
        const enchantedDeco3 = [
            "UNIQUE_FURNITUREITEM_MORGANA_PENTAGRAM",
            "UNIQUE_FURNITUREITEM_MORGANA_PRISON_CELL_C",
            "UNIQUE_FURNITUREITEM_MORGANA_TENT_A"
        ];
        if (enchantedDeco3.includes(s)) {
            return s+"@3";
        }
        if (s.startsWith("JOURNAL",3)) {
            return s+"_EMPTY";
        }
        return s;
    }
    
    static getBaseId(s) {
        if (s.charAt(s.length-2)==="@") {
            return s.slice(0,s.length-2)
        }
        else if (s.startsWith("JOURNAL",3) && (s.endsWith("EMPTY") || s.endsWith("FULL"))) {
            console.log(s);
            console.log(s.slice(0,s.lastIndexOf("_")));
            return s.slice(0,s.lastIndexOf("_"));
        }
        return s;
    }
}

class PriceInfo {
    // Prices are stored as [city,price]
    price = new Map();
    priceTimescale = new Map();
    // Price qualities so that items with variable quality are saved as quality 2 if possible
    priceQualities = new Map();
}

class Recipe {
    // Might be issue with results being strings
    focus;
    silver;
    time;
    // formatted as item id followed by amount of resources
    resources = [];
    // amount is amount crafted
    amount = 1;
    // Whether or not the recipe can return resources
    canReturn = true;
    /**
     * 
     * @param {number} focus 
     * @param {number} silver 
     * @param {number} time 
     * @param {array} resources Resources, as obtained from the item json
     */
    constructor (focus,silver,time,resources) {
        this.focus = parseFloat(focus);
        this.silver = parseFloat(silver);
        this.time = parseFloat(time);
        for (const resource of resources) {
            this.addResource(Item.getPriceId(resource["@uniquename"]),parseFloat(resource["@count"]));
        }
    }

    addResource(priceId,count) {
        this.resources.push({"priceId":priceId,"count":count});
    }
}

class RecipeBox {
    craftedItems = []; // The item array that this recipe is used to craft (ItemBox)
    currentBox; // The box corresponding to this recipe
    boundedItems = []; // Might not be needed
    index; // Index of recipe box to allow for quicker referencing in nodes list
    x = 0;
    y = 0;
    width;
    height;
    //static BOX_WIDTH = 200;
    /**
     * 
     * @param {Item} craftedItem 
     */
    constructor(craftedItem) {
        this.craftedItems.push(craftedItem);
        this.currentBox = document.createElement("div");
        this.setHeight(ItemBox.BOX_HEIGHT+4.8);
        this.index = -1;
    }

    setX(x) {
        this.x = x;
        this.currentBox.style.left = x+"px";
    }

    setY(y) {
        this.y = y;
        this.currentBox.style.top = y+"px";
    }
    setWidth(width) {
        this.width = width;
        this.currentBox.style.width = width+"px";
    }
    setHeight(height) {
        this.height = height;
        this.currentBox.style.height = height+"px";
    }
}

class ItemBox {
    boundingRecipe; // The box that contains this item (RecipeBox)
    currentBox; // The box corresponding to this item
    item; // Item object
    craftingRecipes = [];
    offset;
    craftingCost;
    craftingCostSpan;
    links = new Map(); 
    count;
    static BOX_WIDTH = 200;
    static BOX_HEIGHT = 100;
    /**
     * 
     * @param {RecipeBox} boundingRecipe 
     * @param {Item} item 
     * @param {Number} offset 
     * @param {Boolean} allowInput
     */
    constructor(boundingRecipe, item, offset,count) {
        this.boundingRecipe = boundingRecipe;
        this.boundingRecipe.boundedItems.push(this);
        this.currentBox = document.createElement("div");
        this.currentBox.classList.add("item-box");
        this.currentBox.style.left = offset+"px";
        this.currentBox.style.width = ItemBox.BOX_WIDTH+"px";
        this.currentBox.style.height = ItemBox.BOX_HEIGHT+"px";
        this.item = item;
        this.offset = offset;
        this.count = count;
        // Create box sections
        const descriptor = document.createElement("p");
        descriptor.innerText = `${idToName[this.item.priceId]} (${this.item.tier}.${this.item.enchantment}) (x${count})`;
        this.currentBox.appendChild(descriptor);

        const craftCost = document.createElement("p");
        craftCost.innerText = "Crafting cost: ";
        this.craftingCostSpan = document.createElement("span");
        this.craftingCostSpan.innerText = "N/A";
        craftCost.appendChild(this.craftingCostSpan);
        this.currentBox.appendChild(craftCost);

        const buyCost = document.createElement("p");
        buyCost.innerText = "Market price: ";
        const inputBox = document.createElement("input");
        inputBox.type = "text";
        let priceInfos = null;
        if (!$("#date-selector").is(":checked")) {
            priceInfos = item.priceInfos.get(DateEnum.OLD);
        } else {
            priceInfos = item.priceInfos.get(DateEnum.OLD);
        }
        inputBox.placeholder = priceInfos.price.get($("#city-selector").val());
        buyCost.appendChild(inputBox)
        this.currentBox.appendChild(buyCost);
    }

    setCraftingCost(newCost) {
        this.craftingCost = newCost;
        this.craftingCostSpan.innerText = newCost;
    }

    toString() {
        return "Item box for "+item;
    }
}

async function getProfits() {
    document.getElementById("recipes-area").innerHTML = "";
    const input = $("#item-name").val();
    console.log("Input value: "+input);
    // If input value is contained in nameToID
    if (nameToID.hasOwnProperty(input)) {
        let ids = getItemIds(input);
        ids.sort();
        // Set containing all strings for which prices need to be determined
        let uncheckedItems = new Map();
        // Stack containing items that still need to be determined whether a price check is needed
        let itemStack = [];
        // Set up stack with all items in ids array
        for (const priceId of ids) {
            itemStack.push(new Item(priceId));
        }
        while (itemStack.length > 0) {
            const currentItem = itemStack.pop();
            // console.log(`current item: ${currentItem}`);
            // If current item is not in checked or unchecked items
            if (!uncheckedItems.has(currentItem.priceId) && !checkedItems.has(currentItem.priceId)) {
                //console.log(`currentItem: ${typeof currentItem}`);
                for (const recipe of currentItem.recipes) {
                    for (const resource of recipe.resources) {
                        itemStack.push(new Item(resource.priceId));
                    }
                }
                uncheckedItems.set(currentItem.priceId,currentItem);
                checkedItems.set(currentItem.priceId,currentItem);
            }
        }
        //console.log(uncheckedItems)
        console.log("setting prices");
        await setPrices(uncheckedItems);
        displayRecipes(ids)
       //getAveragePrices();
    } else {
        console.log(`input string ${input} not found`);
    }
}

async function previousDateString() {
    const patchDateDoc = await getDoc(doc(db,"General/Patch Data"));
    const patchDates = await patchDateDoc.data();
    const previousPatchDateDate = new Date(patchDates["Previous Date"]);
    const previousPatchDateString = previousPatchDateDate.getUTCFullYear()+"-"+
        (previousPatchDateDate.getUTCMonth()+1)+"-"+
        (previousPatchDateDate.getUTCDate());
    const patchDateDate = new Date(patchDates.Date);
    const patchDateString = patchDateDate.getUTCFullYear()+"-"+
        (patchDateDate.getUTCMonth()+1)+"-"+
        (patchDateDate.getUTCDate());
    return dateString(previousPatchDateString,patchDateString);
}

async function currentDateString() {
    const patchDateDoc = await getDoc(doc(db,"General/Patch Data"));
    const patchDates = await patchDateDoc.data();
    const previousPatchDateDate = new Date(patchDates.Date);
    const previousPatchDateString = previousPatchDateDate.getUTCFullYear()+"-"+
        (previousPatchDateDate.getUTCMonth()+1)+"-"+
        (previousPatchDateDate.getUTCDate());
    const currentDateDate = new Date();
    const currentDateString = currentDateDate.getUTCFullYear()+"-"+
        (currentDateDate.getUTCMonth()+1)+"-"+
        (currentDateDate.getUTCDate());
    return dateString(previousPatchDateString,currentDateString);

}
function dateString(startDate,endDate) {
    return "?date="+startDate+"&end_date="+endDate;
}

/**
 * 
 * @param {String} itemId 
 * @returns An array containing item ids of all weapons that share the name in the tree
 */
function getItemIds(itemId) {
    const MIN_TIER = 4;
    const MAX_TIER = 8;
    let ids = structuredClone(nameToID[itemId]);
    ids.forEach((element,index,array) => {
        const secondValue = parseInt(element.charAt(1));
        if (element.charAt(0) === "T" && secondValue != NaN) {
            // Current item has different tiers since it is T-some number
            const stringRemainder = element.slice(2);
            for (let i = MIN_TIER; i <= MAX_TIER; i++) {
                if (i != secondValue) {
                    array.push("T"+i+stringRemainder);
                }
            }
        }
    });
    return ids;
}

/**
 * 
 * @param {Set} uncheckedItems A set containing Items representing all items for which prices have not yet been calculated
 */
async function setPrices(uncheckedItems) {
    const PRICE_URL_START = "https://west.albion-online-data.com/api/v2/stats/history/";
    const PRICE_URL_END_OLD = await previousDateString()+"&locations=0007,1002,2004,3005,3008,4002,5003&time-scale=";
    const PRICE_URL_END_NEW = await currentDateString()+"&locations=0007,1002,2004,3005,3008,4002,5003&time-scale=";
    const startStringLength = PRICE_URL_START.length;
    const endStringLength = Math.max(PRICE_URL_END_OLD.length,PRICE_URL_END_NEW.length);
    const MAX_URL_LENGTH = 4096;
    // Note: Missing time scale so that I can test out all 3 possible timescales
    let currentItemString = "";
    uncheckedItems.forEach(async currentItem => {
        // Check if more prices can fit into current URL
        let currentPriceId = currentItem.priceId;
        if (currentItemString.length + currentPriceId.length < MAX_URL_LENGTH) {
            if (currentItemString.length == 0) {
                currentItemString = currentPriceId;
            } else {
                currentItemString += (","+currentPriceId);
            }
        } else {
            await getPrices(PRICE_URL_START+currentItemString+PRICE_URL_END_OLD,DateEnum.OLD);
            await getPrices(PRICE_URL_START+currentItemString+PRICE_URL_END_NEW,DateEnum.NEW);
            currentItemString = currentItem.id;
        }
    });
    if (currentItemString === "") {
        console.log("No more new prices to collect.");
        return;
    }
    await getPrices(PRICE_URL_START+currentItemString+PRICE_URL_END_OLD,DateEnum.OLD);
    await getPrices(PRICE_URL_START+currentItemString+PRICE_URL_END_NEW,DateEnum.NEW);
    uncheckedItems.clear();
}

/**
 * 
 * @param {String} priceURL URL needed for api, not including timescale
 * @param {DateEnum} timeSpan OLD or NEW, representing previous patch or current patch, respectively
 */
async function getPrices(priceURL,timeSpan) {
    function fixLocation(initialLocation) {
        if (initialLocation == "5003") {
            return "Brecilien";
        } else {
            return initialLocation;
        }
    }
    console.log("Price url: "+priceURL);
    const timescales = [1,6,24]
    for (const timescale of timescales) {
        let priceContents = await fetch(priceURL+timescale);
        let priceContentsJSON = await priceContents.json();
        // Check timescale and update prices if timescale is higher
        for (const currentItem of priceContentsJSON) {
            const currentPriceId = currentItem.item_id;
            let targetItem; 
            if (!checkedItems.has(currentPriceId)) {
                console.log("priceId "+currentPriceId+" was not added to checkedItems");
                targetItem = new Item(currentPriceId);
                checkedItems.set(currentPriceId,targetItem);
            } else {
                targetItem = checkedItems.get(currentPriceId);
            }
            // Get prices; set to appropriate location
            const location = fixLocation(currentItem["location"]);
            const quality = currentItem["quality"];
            //console.log("target item: "+targetItem);
            const priceInfo = targetItem.priceInfos.get(timeSpan);
            if (quality <= 2) {
                if (!priceInfo.priceQualities.has(location) || quality >= priceInfo.priceQualities.get(location)) {
                    // add price if timescale is better
                    const data = currentItem["data"];
                    // Find timescale difference
                    const startDate = data[0]["timestamp"];
                    const endDate = data[data.length-1]["timestamp"];
                    const timescale = (Date.parse(endDate)-Date.parse(startDate));
                    // console.log(`start date: ${startDate}, end date: ${endDate}`);
                    if (!priceInfo.priceTimescale.has(location) || timescale > priceInfo.priceTimescale.get(location)) {
                        let total = 0;
                        for (const timestampData of data) {
                            total += timestampData["avg_price"];
                        }
                        const average = total/data.length;
                        //console.log("average: "+average);
                        priceInfo.price.set(location,average);
                        //console.log("Updating with new prices")
                    }
                    
                    // Find timescale
                }
            }
            
        }
        console.log("Done with timescale "+ timescale);
    }
}

function displayRecipes(ids) {
    for (const currentPriceId of ids) {
        const currentItem = checkedItems.get(currentPriceId);

        // Set up div to contain the current recipe box
        const currentBox = document.createElement('div'); // creates the element
        currentBox.id = currentPriceId;
        document.getElementById("recipes-area").appendChild(currentBox);

        // Item description bar (shows up before slide toggling)
        const itemDescriptor = document.createElement("div");
        itemDescriptor.innerText = idToName[currentPriceId];
        itemDescriptor.innerText += ` (${currentItem.tier}.${currentItem.enchantment})`;
        currentBox.appendChild(itemDescriptor);

        // Display area for items
        const displayBox = document.createElement("figure");
        // Svg to display associated lines
        const boxLines = document.createElementNS("http://www.w3.org/2000/svg",'svg');
        boxLines.setAttribute("height",2000);
        boxLines.setAttribute("width",4000);
        const defs = document.createElementNS("http://www.w3.org/2000/svg","defs");
        const arrowhead = document.createElementNS("http://www.w3.org/2000/svg","marker");
        const path = document.createElementNS("http://www.w3.org/2000/svg","path");
        path.setAttribute("d","M 0 0 L 5 2.5 L 0 5 Z");
        //path.setAttribute("fill","black");
        arrowhead.appendChild(path);
        arrowhead.setAttribute("id","arrow"); 
        arrowhead.setAttribute("markerWidth","5");
        arrowhead.setAttribute("markerHeight","5");
        
        arrowhead.setAttribute("refX","2.5");
        arrowhead.setAttribute("refY","2.5");
        
        arrowhead.setAttribute("orient","auto");
        defs.appendChild(arrowhead);
        boxLines.appendChild(defs);
        displayBox.appendChild(boxLines);
        currentBox.appendChild(displayBox);

        // START CREATING BOXES TO DISPLAY INSIDE DISPLAY BOX
        // Set up nodes and links to connect using d3
        const nodes = []; // Recipe boxes
        const links = []; // Links between recipe boxes that also contain information for which item is actually linked


        // Set of item IDs that have been visited already mapped to an array of recipe link indexes (do not need to create associated recipes again)
        const visitedItems = new Map();

        // Stack of ItemBoxes whose recipes still need processing
        const itemBoxStack = [];

        // Create the head box
        const headBox = new RecipeBox(null);
        headBox.index = 0;
        const itemBox = new ItemBox(headBox,currentItem,0,1);
        headBox.setWidth(ItemBox.BOX_WIDTH+4.8); //4.8 to account for border width
        itemBox.currentBox.style["background-color"] = "gold";
        headBox.currentBox.appendChild(itemBox.currentBox);
        nodes.push({"box":headBox});
        itemBoxStack.push(itemBox);
        displayBox.appendChild(headBox.currentBox);

        // Iterate through all recipes, adding to nodes and links
        while (itemBoxStack.length > 0) {
            const activeItemBox = itemBoxStack.pop();
            const activeItem = activeItemBox.item;
            // Check if active item has already been visited somewhere else
            if (visitedItems.has(activeItem.priceId)) {
                // If so, just create connections to pre-existing recipe boxes
                for (const sourceIndex of visitedItems.get(activeItem.priceId)) {
                    // Add current item box to the array of items that the current recipe is used to craft
                    nodes[sourceIndex].box.craftedItems.push(activeItemBox);
                    links.push({
                        "source":sourceIndex,
                        "target":activeItemBox.boundingRecipe.index,
                        "itemBox":activeItemBox
                    });
                    activeItemBox.links.set(nodes[sourceIndex].box,links[links.length-1]);
                }
            } else {
                // Otherwise, create new recipe boxes and add links to them
                const sourceIndexes = [];
                for (const recipe of activeItem.recipes) {
                    const resourceCount = recipe.resources.length;
                    // Create recipe box for item
                    //console.log("recipe: "+recipe.resources[0]);
                    const recipeBox = new RecipeBox(activeItemBox);
                    displayBox.appendChild(recipeBox.currentBox);
                    recipeBox.setWidth(resourceCount*ItemBox.BOX_WIDTH+4.8); // 4.8 to account for border width
                    recipeBox.index = nodes.length;
                    // add recipe box to nodes
                    nodes.push({"box":recipeBox});
                    // Create a link from recipe box to the bounding box, with the active item box as additional information
                    links.push({
                        "source":recipeBox.index,
                        "target":activeItemBox.boundingRecipe.index,
                        "itemBox":activeItemBox
                    });
                    activeItemBox.links.set(recipeBox,links[links.length-1]);
                    sourceIndexes.push(recipeBox.index);
                    for (let i = 0; i < resourceCount; i++) {
                        const offset = ItemBox.BOX_WIDTH*i;
                        const newItemId = recipe.resources[i].priceId;
                        const newItemCount = recipe.resources[i].count;
                        const currentItemBox = new ItemBox(recipeBox,checkedItems.get(newItemId),offset,newItemCount);
                        recipeBox.currentBox.appendChild(currentItemBox.currentBox);
                        itemBoxStack.push(currentItemBox);
                    }
                }
                visitedItems.set(activeItem.priceId,sourceIndexes);
            }
        }
        calculateCosts(itemBox);
        // Create svg elements to correspond with lines
        for (const link of links) {
            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute("marker-end","url(#arrow)");
            link.line = line;
            boxLines.appendChild(line);
        }
        
        var simulation = d3
            .forceSimulation(nodes)
            //.force('charge', d3.forceManyBody().strength(-600))
            .force('link',d3.forceLink(links))
            .force("collide",d3.forceCollide().radius(node => node.box.width/2).strength(0.5))
            .force('x', d3.forceX(0).strength(0.5))
            .force('y', d3.forceY(0).strength(0.5))
            //.force('center', d3.forceCenter(0,0));
        
        console.log(nodes);
        console.log(links);
        simulation.on('tick', () => {
            // Find the minimum node x and y values in order to shift all nodes by that amount
            let minX = Number.MAX_SAFE_INTEGER;
            let minY = Number.MAX_SAFE_INTEGER;
            let maxX = 0;
            let maxY = 0;
            for (const node of nodes) {
                minX = Math.min(minX,node.x-node.box.width/2);
                minY = Math.min(minY,node.y-node.box.height/2);
                maxX = Math.max(maxX,node.x+node.box.width/2);
                maxY = Math.max(maxY,node.y+node.box.height/2);
            }
            boxLines.setAttribute("height",maxY-minY);
            boxLines.setAttribute("width",maxX-minX);
            for (const node of nodes) {
                node.box.setX(node.x-minX-node.box.width/2);
                node.box.setY(node.y-minY-node.box.height/2);
            }
            for (const link of links) {
                const line = link.line;
                // Source of line position (the items being used to craft)
                line.setAttribute("x1", link.source.x-minX);
                line.setAttribute("y1", link.source.y-minY);

                // Destination of line position (the item being crafted)
                line.setAttribute("x2", link.target.x-minX-link.target.box.width/2+link.itemBox.offset+ItemBox.BOX_WIDTH/2);
                if (link.target.y > link.source.y) {
                    line.setAttribute("y2", link.target.y-minY-link.target.box.height/2);
                } else {
                    line.setAttribute("y2", link.target.y-minY+link.target.box.height/2);
                }
            }
        });
    }
}

/**
 * 
 * @param {ItemBox} currentItemBox 
 * @return {Number}
 */
function calculateCosts(currentItemBox) {
    // Figure out minimum crafting cost among links of the current item

    // Determine minimum cost (compare to buying the item itself)
    
    // Display minimum crafting cost using craftingCost field 
    console.log(currentItemBox.item.priceId);
}

/**
 * 
 * @param {RecipeBox} currentRecipeBox
 * @return {Number} total crafting cost of current recipe box
 */
function calculateCraftingCost(currentRecipeBox) {

}
function calculateProfit(itemID,tax) {
    const sellPrice = getAveragePrices(itemID);
    const craftPrice = getCraftingPrice(itemID);
    return (1-tax)*sellPrice-craftPrice;
}


$("#load-price-button").on("click", getProfits);

$( "#item-name" ).autocomplete({
    source: names
});

$("#city-selector").on("change",()=>{
    getProfits();
    console.log($("#city-selector").val());
});

$("#date-selector").on("change",()=>{
    getProfits();
    console.log($("#date-selector").is(":checked"));
});

$("#recipes-area").on("click","div figure", function(event){
    console.log("click");
    event.stopPropagation();
});

$("#recipes-area").on("click","div",function(){
    //const currentClass = $(this).attr("id");
    $(this).find("figure").slideToggle("slow");
    $(this).find("svg").slideToggle("slow");
});