import { reverseCityBonuses } from "../globals/constants.js";
import { recipesWithT,recipesWithoutT,itemsJSON,idToName } from "../external-data.js";
import {Recipe,CraftingBonusRecipe,MultiRecipe,ButcherRecipe,EnchantmentRecipe, MerchantRecipe} from "./recipe.js";
enum DateEnum {
    OLD,
    NEW
}

type CraftingRequirement = {
    "@silver":string,
    "@time"?:string,
    "@craftingfocus"?:string,
    "@amountcrafted"?:string,
    "@returnproductnotresource"?:string // Applies to butcher products
    currency?: Currency[] | Currency // For things like faction hearts that use faction points
    craftresource?: CraftResource[] | CraftResource // Farming items do not have any craft resources (also dungeon tokens)
}

type CraftResource = {
    "@uniquename":string,
    "@count":string
    "@maxreturnamount"?:string // I assume this is for specifying that weapons do not have artifacts returned
}

type Currency = {
    "@uniquename":string,
    "@amount":string
}

type EnchantmentRequirement = {
    "@enchantmentlevel": string
    "craftingrequirements": CraftingRequirement|CraftingRequirement[]
    "upgraderequirements"?: { // Enchantment level 4 weapons do not have the ability to upgrade
        "upgraderesource": {
            "@uniquename": string
            "@count": string
        }
    }
}

type ItemData = {
    "@uniquename":string,
    "@tier"?: string // Skins do not have tier
    "@enchantment"?: string
    "@shopcategory"?: string // Certain skins do not have shopcategory or shopsubcategory
    "@shopsubcategory1"?: string
    "@itemvalue"?: string // itemvalue and craftingcategory seem to be mutually exclusive
    "@craftingcategory"?: string
    "craftingrequirements"?: CraftingRequirement | CraftingRequirement []
    "enchantments"?: {
        enchantment: EnchantmentRequirement[]
    }
}
class Item {
    priceInfos = new Map([
        [DateEnum.OLD,new ExtendedPriceInfo()],
        [DateEnum.NEW,new ExtendedPriceInfo()]
    ]);
    craftedPriceInfos = new Map([
        [DateEnum.OLD,new PriceInfo()],
        [DateEnum.NEW,new PriceInfo()]
    ]);
    priceCalculated = false;
    overridePrice = undefined;
    tier:number|undefined = undefined;
    enchantment = 0;
    id;
    priceId;
    itemValue:number;
    recipes:Recipe[] = [];
    /*
    category:string;
    subcategory:string;
    */
    constructor(priceId:string) {
        this.priceId = priceId;
        this.id = Item.getBaseId(priceId);
        this.#setTier();
        this.#setEnchantment();
        this.#setRecipesAndCategories();
    }

    getMinCost(timespan:DateEnum,city:string) {
        if (this.overridePrice != undefined) {
            return this.overridePrice;
        } else {
            const marketPrice = this.priceInfos.get(timespan)!.price.get(city);
            const craftedPrice = this.craftedPriceInfos.get(timespan)!.price.get(city);
            if (marketPrice == undefined && craftedPrice == undefined) {
                return undefined;
            } else if (marketPrice != undefined && craftedPrice != undefined) {
                return Math.min(marketPrice,craftedPrice);
            } else if (marketPrice != undefined) {
                return marketPrice;
            } else {
                return craftedPrice;
            }
        }
    }

    calculateCraftingCost(items:Map<string,Item>) {
        // Go through recipes and update crafting costs each time?
        // Or go through dates and cities and go through each recipe each time
        for (const recipe of this.recipes) {
            // For each item in the recipe, if crafting cost is not yet determined, determine its crafting cost first
            //recipe.calculateCraftingCost(items,????);
        }
    }

    #setTier() {
        const secondValue = parseInt(this.id.charAt(1));
        if (this.id.charAt(0) === "T" && !Number.isNaN(secondValue)) {
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
        let current = itemsJSON;
        for (const pathElement of path) {
            current = current[pathElement];
        }
        //console.log(itemInfo);
        /*
        const addRecipe= (element:CraftingRequirement) => {
            //console.log(`id: ${this.id}, addRecipe element: ${JSON.stringify(element)}`);
            if (element.hasOwnProperty("craftresource")) {
                let craftResource = element.craftresource;
                if (!Array.isArray(craftResource)) {
                    craftResource = [craftResource];
                }
                //console.log(`craftresource used to add to recipe: ${craftResource}`);
                let currentRecipe = new Recipe(element["@craftingfocus"],element["@silver"],element["@time"],craftResource);
                if (element.hasOwnProperty("@amountcrafted")) {
                    currentRecipe.amount = parseInt(element["@amountcrafted"]);
                }
                this.recipes.push(currentRecipe);
            }
        }
        */
        const addCraftingBonusRecipe = (craftingCategory:string, craftingRequirement:CraftingRequirement)=>{ // Has to be arrow function for the correct reference to "this" (should be the containing Item, not the function)
            // Determine which city this item receives the crafting bonus for
            const bonusCity = reverseCityBonuses[craftingCategory]!;
            let resources = craftingRequirement.craftresource!;
            if (!Array.isArray(resources)) {
                resources = [resources];
            }
            let newRecipe;
            if (Object.hasOwn(craftingRequirement,"@amountcrafted")) { // Multi recipe
                if (Object.hasOwn(craftingRequirement,"@returnproductnotresource")) { // Butcher recipe
                    newRecipe = new ButcherRecipe(
                        parseInt(craftingRequirement["@silver"]),
                        parseInt(craftingRequirement["@craftingfocus"]!),
                        bonusCity,
                        parseInt(craftingRequirement["@amountcrafted"]!),
                        resources
                    )
                } else {
                    newRecipe = new MultiRecipe(
                        parseInt(craftingRequirement["@silver"]),
                        parseInt(craftingRequirement["@craftingfocus"]!),
                        bonusCity,
                        parseInt(craftingRequirement["@amountcrafted"]!),
                        resources
                    )
                }
            } else {
                newRecipe = new CraftingBonusRecipe(
                    parseInt(craftingRequirement["@silver"]),
                    parseInt(craftingRequirement["@craftingfocus"]!),
                    bonusCity,
                    resources);
            }
            this.recipes.push(newRecipe);
        }
        const addEnchantmentRecipe = (previousId:string, craftResources:CraftResource[])=>{
            const newRecipe = new EnchantmentRecipe(0,craftResources,previousId);
            this.recipes.push(newRecipe);
        }
        const addMerchantRecipe = (craftingRequirement:CraftingRequirement)=>{
            if (Object.hasOwn(craftingRequirement,"currency")) {
                return; // Object has a currency like faction points, which is difficult to convert to silver
            }
            // Might or might not have resources involved in the recipe
            let resources = craftingRequirement.craftresource;
            if (resources == undefined) {
                resources = [];
            } else if (!Array.isArray(resources)) {
                resources = [resources];
            }
            const newRecipe = new MerchantRecipe(
                parseInt(craftingRequirement["@silver"]),
                resources
            )
            this.recipes.push(newRecipe);
        }
        let itemInfo:ItemData = current;

        if (Object.hasOwn(itemInfo,"enchantments") && this.enchantment > 0) { // Check if enchanted item
            const enchantmentInfo:EnchantmentRequirement = itemInfo.enchantments!.enchantment[this.enchantment-1]!;
            // Add crafting requirements (using enchanted materials)
            const craftingRequirements = enchantmentInfo.craftingrequirements;
            if (Array.isArray(craftingRequirements)) {
                for (const craftingRequirement of craftingRequirements) {
                    addCraftingBonusRecipe(itemInfo["@craftingcategory"]!,craftingRequirement);
                }
            } else {
                addCraftingBonusRecipe(itemInfo["@craftingcategory"]!,craftingRequirements);
            }
            // Add upgrade requirements, if they exist
            if (Object.hasOwn(enchantmentInfo,"upgraderequirements")) {
                let previousId;
                if (this.enchantment === 1) {
                    previousId = this.priceId.slice(0,-2);
                } else {
                    previousId = this.priceId.slice(0,-1)+(this.enchantment-1);
                }
                addEnchantmentRecipe(previousId,[enchantmentInfo.upgraderequirements!.upgraderesource as CraftResource]);
            }
        } else {
            if (!Object.hasOwn(itemInfo,"craftingrequirements")) {
                console.log(`ID ${this.id} cannot be crafted`);
                return;
            }
            if (itemInfo["@shopcategory"] == "artefacts") {
                return; // Artifacts have a crafting recipe, but it is based on random chance, so we will not consider it
            }
            // Add crafting requirements
            const craftingRequirements = itemInfo.craftingrequirements!;
            if (Object.hasOwn(itemInfo,"@craftingcategory")) {
                if (Array.isArray(craftingRequirements)) {
                    for (const craftingRequirement of craftingRequirements) {
                        addCraftingBonusRecipe(itemInfo["@craftingcategory"]!,craftingRequirement);
                    }
                } else {
                    addCraftingBonusRecipe(itemInfo["@craftingcategory"]!,craftingRequirements);
                }
            } else {
                if (Array.isArray(craftingRequirements)) {
                    for (const craftingRequirement of craftingRequirements) {
                        addMerchantRecipe(craftingRequirement);
                    }
                } else {
                    addMerchantRecipe(craftingRequirements);
                }
            }
            
        }
        // Add a recipe based on the contents of craftingrequirements
    }

    

    /*
    toString() {
        let oldPriceData = Array.from(this.priceInfos.get(DateEnum.Old)!.price);
        let newPriceData = Array.from(this.priceInfos.get(DateEnum.New)!.price);
        return `name: ${idToName[Item.getPriceId(this.id)]}, 
        id: ${this.id}, 
        category: ${this.category}, 
        subcategory: ${this.subcategory}, 
        tier: ${this.tier}, 
        enchantment: ${this.enchantment}, 
        old price: ${oldPriceData}, 
        new price: ${newPriceData}`;
    }
    */
    static getPriceId(s:string) {
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
    
    static getBaseId(s:string) {
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
    price = new Map<string,number>(); // City name, price value 
}

/**
 * This class used to store additional price info so that price fetch calculations can be more accurate
 */
class ExtendedPriceInfo extends PriceInfo{
    priceTimescale = new Map<string,number>(); // City name, timescale covered
    // Price qualities so that items with variable quality are saved as quality 2 if possible
    priceQualities = new Map<string,number>(); // City name, quality number
}


export {DateEnum,Item,CraftResource};