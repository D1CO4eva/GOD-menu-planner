/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { 
  Utensils, 
  Users, 
  Ban, 
  ChefHat, 
  Loader2, 
  ChevronRight, 
  Share2,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Trash2,
  FileSpreadsheet,
  X
} from "lucide-react";
import * as XLSX from 'xlsx';
import { cn } from "./lib/utils";
import { MenuItem, MenuPlan } from "./types";

const DEFAULT_THEME = {
  color: "bg-[#2E3192]",
  light: "bg-[#2E3192]/10",
  text: "text-[#2E3192]",
  border: "border-[#2E3192]/20",
};

const CUISINES = [
  "South Indian",
  "North Indian",
  "Italian",
  "Chinese",
  "Continental",
  "Mexican",
  "Mediterranean",
  "Thai",
];

const MANDATORY_RESTRICTIONS = [
  "Vegetarian only",
  "No onion",
  "No garlic",
  "No eggs",
  "No mushrooms",
  "No fish oils",
  "No animal enzymes in cheese",
];

const PROGRAM_TEMPLATES = [
  {
    id: "radha-kalyanam",
    name: "Radha Kalyanam",
    description: "Large South Indian-heavy feast with rice and curry staples.",
    defaultPeople: 90,
    defaultCuisines: ["South Indian"],
    guidance: "Create 8-10 well-balanced dishes for 80-100 devotees. Keep it mostly South Indian with a few exceptions. Prioritize rice-focused mains and classic curries like rasam, sambar, and mozhkozhambu.",
  },
  {
    id: "mass-prayer",
    name: "Mass Prayer",
    description: "Compact high-volume menu for a large gathering.",
    defaultPeople: 165,
    defaultCuisines: ["North Indian", "South Indian"],
    guidance: "Keep it compact: 3-5 dishes total even for large crowds. Include one bread (poori or chapathi) with one curry (chole or paneer), plus curd rice and either pulao or sambar rice.",
  },
  {
    id: "nikunja-utsavam",
    name: "Nikunja Utsavam",
    description: "Mixed menu with North + South Indian and optional Italian.",
    defaultPeople: 90,
    defaultCuisines: ["South Indian", "North Indian", "Italian"],
    guidance: "Create 7-9 dishes with a mixed cuisine profile. Combine North and South Indian dishes and optionally include one Italian item (usually penne pasta).",
  },
  {
    id: "satsang",
    name: "Satsang",
    description: "Diverse menu for around 40 devotees.",
    defaultPeople: 40,
    defaultCuisines: ["North Indian", "South Indian", "Chinese"],
    guidance: "Plan for around 40 devotees with 4-6 dishes total. Keep the menu practical and not buffet-sized. Mix cuisines, but avoid too many similar items.",
  },
  {
    id: "other",
    name: "Other",
    description: "Manual planning for a custom program.",
    defaultPeople: null,
    defaultCuisines: [],
    guidance: "Use the user-provided details to design the menu.",
  },
] as const;

type ProgramId = (typeof PROGRAM_TEMPLATES)[number]["id"];
type ProgramTheme = {
  color: string;
  light: string;
  text: string;
  border: string;
};

type ItemEditorState = {
  mode: "add" | "edit";
  courseIndex: number;
  itemIndex: number | null;
  draft: MenuItem;
};

type DragItemState = {
  courseIndex: number;
  itemIndex: number;
};

type DragTargetState = {
  courseIndex: number;
  itemIndex: number | null;
};

const PROGRAM_THEMES: Record<ProgramId, ProgramTheme> = {
  "radha-kalyanam": {
    color: "bg-[#C65D00]",
    light: "bg-[#C65D00]/10",
    text: "text-[#A84E00]",
    border: "border-[#C65D00]/25",
  },
  "mass-prayer": {
    color: "bg-[#2E3192]",
    light: "bg-[#2E3192]/10",
    text: "text-[#2E3192]",
    border: "border-[#2E3192]/25",
  },
  "nikunja-utsavam": {
    color: "bg-[#6D28D9]",
    light: "bg-[#6D28D9]/10",
    text: "text-[#6D28D9]",
    border: "border-[#6D28D9]/25",
  },
  satsang: {
    color: "bg-[#0F766E]",
    light: "bg-[#0F766E]/10",
    text: "text-[#0F766E]",
    border: "border-[#0F766E]/25",
  },
  other: {
    color: "bg-[#475569]",
    light: "bg-[#475569]/10",
    text: "text-[#334155]",
    border: "border-[#475569]/25",
  },
};

const PROGRAM_TRAY_RULES: Record<ProgramId, string> = {
  "radha-kalyanam": "1 Large Tray",
  "mass-prayer": "2-3 Large Trays",
  "nikunja-utsavam": "1 Large Tray",
  "satsang": "1 Small Tray",
  other: "1 Small Tray",
};

type MenuCourse = MenuPlan["courses"][number];

const CATEGORY_REDUCTION_ORDER = [
  "desserts",
  "appetizers",
  "sides/accompaniments",
  "main course",
];

const normalizeCategoryKey = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

const getMenuItemRange = (programId: ProgramId, groupSize: number) => {
  const sizeBasedMax =
    groupSize <= 25 ? 4 :
    groupSize <= 50 ? 6 :
    groupSize <= 80 ? 8 :
    groupSize <= 120 ? 10 :
    groupSize <= 180 ? 12 : 14;

  let minItems = 4;
  let maxItems = sizeBasedMax;

  if (programId === "radha-kalyanam") {
    minItems = 8;
    maxItems = 10;
  } else if (programId === "mass-prayer") {
    minItems = 3;
    maxItems = 5;
  } else if (programId === "nikunja-utsavam") {
    minItems = 7;
    maxItems = 9;
  } else if (programId === "satsang") {
    minItems = 4;
    maxItems = 6;
  } else {
    minItems = groupSize <= 30 ? 3 : groupSize <= 70 ? 4 : groupSize <= 120 ? 5 : 6;
    maxItems = sizeBasedMax;
  }

  maxItems = Math.min(maxItems, sizeBasedMax);
  minItems = Math.min(minItems, maxItems);

  return { minItems, maxItems };
};

const dedupeAndCapCourses = (courses: MenuCourse[], maxItems: number): MenuCourse[] => {
  const seenDishNames = new Set<string>();
  const deduped = courses
    .map((course) => ({
      ...course,
      items: course.items.filter((item) => {
        const key = item.name.trim().toLowerCase();
        if (!key) return false;
        if (seenDishNames.has(key)) return false;
        seenDishNames.add(key);
        return true;
      }),
    }))
    .filter((course) => course.items.length > 0);

  let totalItems = deduped.reduce((sum, course) => sum + course.items.length, 0);
  if (totalItems <= maxItems) return deduped;

  const next = deduped.map((course) => ({ ...course, items: [...course.items] }));
  let safetyCounter = 0;

  while (totalItems > maxItems && safetyCounter < 500) {
    let removed = false;

    for (const category of CATEGORY_REDUCTION_ORDER) {
      const normalizedCategory = normalizeCategoryKey(category);
      const course = next.find((entry) => normalizeCategoryKey(entry.category) === normalizedCategory);
      const minItemsInCourse = normalizedCategory === "maincourse" ? 1 : 0;

      if (course && course.items.length > minItemsInCourse) {
        course.items.pop();
        totalItems -= 1;
        removed = true;
        break;
      }
    }

    if (!removed) {
      const fallback = [...next].sort((a, b) => b.items.length - a.items.length)[0];
      if (!fallback || fallback.items.length === 0) break;
      fallback.items.pop();
      totalItems -= 1;
    }

    safetyCounter += 1;
  }

  return next.filter((course) => course.items.length > 0);
};

const OPENROUTER_API_KEY = "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";
const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const MENU_GENERATION_TIMEOUT_MS = 6000;
const MENU_GENERATION_MAX_TOKENS = 900;
const MENU_CACHE_FETCH_TIMEOUT_MS = 2500;
const MENU_CACHE_MAX_BLOCKLIST_ITEMS = 120;
const MENU_API_URL = (
  import.meta.env.VITE_MENU_API_URL ||
  "https://god-auth-service-693007788010.us-central1.run.app/api/menu"
).trim();

const normalizeDishNameForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export default function App() {
  const [selectedProgramId, setSelectedProgramId] = useState<ProgramId | null>(null);
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [newCuisineInput, setNewCuisineInput] = useState("");
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [peopleInput, setPeopleInput] = useState("10");
  const [customRestrictions, setCustomRestrictions] = useState<string[]>([]);
  const [newRestrictionInput, setNewRestrictionInput] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<MenuPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncingToSheet, setSyncingToSheet] = useState(false);
  const [sheetSyncMessage, setSheetSyncMessage] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<Record<string, string>>({});
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [itemEditorError, setItemEditorError] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<DragItemState | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragTargetState | null>(null);
  const parsedPeopleCount = Number.parseInt(peopleInput, 10);
  const peopleCount = Number.isNaN(parsedPeopleCount) ? 0 : parsedPeopleCount;
  const selectedProgram = PROGRAM_TEMPLATES.find((program) => program.id === selectedProgramId) || null;
  const activeCuisine = selectedProgramId ? PROGRAM_THEMES[selectedProgramId] : DEFAULT_THEME;
  const defaultTrayMeasurement = selectedProgram ? PROGRAM_TRAY_RULES[selectedProgram.id] : "1 Small Tray";

  useEffect(() => {
    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const updateDeviceType = () => {
      setIsMobileDevice(window.innerWidth <= 768 || mobileUserAgent.test(navigator.userAgent));
    };

    updateDeviceType();
    window.addEventListener('resize', updateDeviceType);
    return () => window.removeEventListener('resize', updateDeviceType);
  }, []);

  const handlePeopleChange = (value: string) => {
    if (!/^\d*$/.test(value)) return;
    if (value === "") {
      setPeopleInput("");
      return;
    }
    const boundedValue = Math.min(1000, Number.parseInt(value, 10));
    setPeopleInput(String(boundedValue));
  };

  const handleProgramSelect = (programId: ProgramId) => {
    const template = PROGRAM_TEMPLATES.find((program) => program.id === programId);
    if (!template) return;

    setSelectedProgramId(programId);
    setMenu(null);
    setError(null);
    setSheetSyncMessage(null);
    setVolunteers({});
    setItemEditor(null);
    setItemEditorError(null);
    setCustomRestrictions([]);
    setNewRestrictionInput("");
    setNewCuisineInput("");

    if (template.id === "other") {
      setPeopleInput("");
      setSelectedCuisines([]);
      setAdditionalInstructions("");
      return;
    }

    setPeopleInput(String(template.defaultPeople));
    setSelectedCuisines([...template.defaultCuisines]);
    setAdditionalInstructions(template.guidance);
  };

  const toggleCuisine = (cuisineName: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(cuisineName)
        ? prev.filter((cuisine) => cuisine !== cuisineName)
        : [...prev, cuisineName]
    );
  };

  const addCustomCuisine = () => {
    const trimmed = newCuisineInput.trim();
    if (!trimmed || selectedCuisines.includes(trimmed)) return;
    setSelectedCuisines((prev) => [...prev, trimmed]);
    setNewCuisineInput("");
  };

  const removeCuisine = (cuisineName: string) => {
    setSelectedCuisines((prev) => prev.filter((cuisine) => cuisine !== cuisineName));
  };

  const createBlankMenuItem = (): MenuItem => ({
    name: "",
    description: "",
    estimatedQuantity: "",
    trayMeasurement: defaultTrayMeasurement,
  });

  const normalizeMenuItem = (item: MenuItem): MenuItem => ({
    ...item,
    name: item.name.trim(),
    description: item.description.trim(),
    estimatedQuantity: item.estimatedQuantity.trim(),
    trayMeasurement: item.trayMeasurement.trim() || "1 Small Tray",
    volunteer: item.volunteer?.trim() || undefined,
  });

  const openAddItemEditor = (courseIndex: number) => {
    setItemEditor({
      mode: "add",
      courseIndex,
      itemIndex: null,
      draft: createBlankMenuItem(),
    });
    setItemEditorError(null);
  };

  const openEditItemEditor = (courseIndex: number, itemIndex: number) => {
    if (!menu) return;
    const item = menu.courses[courseIndex]?.items[itemIndex];
    if (!item) return;
    setItemEditor({
      mode: "edit",
      courseIndex,
      itemIndex,
      draft: { ...item },
    });
    setItemEditorError(null);
  };

  const closeItemEditor = () => {
    setItemEditor(null);
    setItemEditorError(null);
  };

  const updateItemEditorField = (field: keyof MenuItem, value: string) => {
    setItemEditor((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        draft: {
          ...prev.draft,
          [field]: value,
        },
      };
    });
  };

  const saveItemEditor = () => {
    if (!menu || !itemEditor) return;

    const normalizedItem = normalizeMenuItem(itemEditor.draft);
    if (!normalizedItem.name) {
      setItemEditorError("Dish name is required.");
      return;
    }

    const { courseIndex, itemIndex, mode } = itemEditor;
    const previousName =
      mode === "edit" && itemIndex !== null
        ? menu.courses[courseIndex]?.items[itemIndex]?.name || ""
        : "";

    setMenu((prev) => {
      if (!prev) return prev;
      const nextCourses = prev.courses.map((course, idx) => {
        if (idx !== courseIndex) return course;
        if (mode === "add") {
          return { ...course, items: [...course.items, normalizedItem] };
        }
        if (itemIndex === null) return course;
        return {
          ...course,
          items: course.items.map((item, iIdx) => (iIdx === itemIndex ? normalizedItem : item)),
        };
      });
      return { ...prev, courses: nextCourses };
    });

    if (mode === "edit" && previousName && previousName !== normalizedItem.name) {
      setVolunteers((prev) => {
        if (!prev[previousName]) return prev;
        const next = { ...prev, [normalizedItem.name]: prev[previousName] };
        delete next[previousName];
        return next;
      });
    }

    closeItemEditor();
  };

  const deleteMenuItem = (courseIndex: number, itemIndex: number) => {
    if (!menu) return;
    const itemName = menu.courses[courseIndex]?.items[itemIndex]?.name || "";

    setMenu((prev) => {
      if (!prev) return prev;
      const nextCourses = prev.courses.map((course, idx) => {
        if (idx !== courseIndex) return course;
        return {
          ...course,
          items: course.items.filter((_, iIdx) => iIdx !== itemIndex),
        };
      });
      return { ...prev, courses: nextCourses };
    });

    if (itemName) {
      setVolunteers((prev) => {
        if (!prev[itemName]) return prev;
        const next = { ...prev };
        delete next[itemName];
        return next;
      });
    }

    setItemEditor((prev) => {
      if (!prev || prev.courseIndex !== courseIndex) return prev;
      if (prev.mode === "edit") {
        if (prev.itemIndex === itemIndex) return null;
        if (prev.itemIndex !== null && prev.itemIndex > itemIndex) {
          return { ...prev, itemIndex: prev.itemIndex - 1 };
        }
      }
      return prev;
    });
    setItemEditorError(null);
  };

  const isDropTarget = (courseIndex: number, itemIndex: number | null) =>
    dragOverTarget?.courseIndex === courseIndex && dragOverTarget?.itemIndex === itemIndex;

  const moveMenuItem = (
    fromCourseIndex: number,
    fromItemIndex: number,
    toCourseIndex: number,
    toItemIndex: number | null
  ) => {
    setMenu((prev) => {
      if (!prev) return prev;

      const nextCourses = prev.courses.map((course) => ({ ...course, items: [...course.items] }));
      const sourceCourse = nextCourses[fromCourseIndex];
      const destinationCourse = nextCourses[toCourseIndex];
      if (!sourceCourse || !destinationCourse) return prev;
      if (fromItemIndex < 0 || fromItemIndex >= sourceCourse.items.length) return prev;

      let insertIndex =
        toItemIndex === null
          ? destinationCourse.items.length
          : Math.max(0, Math.min(toItemIndex, destinationCourse.items.length));

      if (fromCourseIndex === toCourseIndex) {
        if (insertIndex === fromItemIndex || insertIndex === fromItemIndex + 1) {
          return prev;
        }
      }

      const [movedItem] = sourceCourse.items.splice(fromItemIndex, 1);
      if (!movedItem) return prev;

      if (fromCourseIndex === toCourseIndex && fromItemIndex < insertIndex) {
        insertIndex -= 1;
      }

      destinationCourse.items.splice(insertIndex, 0, movedItem);
      return { ...prev, courses: nextCourses };
    });

    setItemEditor(null);
    setItemEditorError(null);
  };

  const parseDraggedItemFromDataTransfer = (event: React.DragEvent): DragItemState | null => {
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw || !raw.includes(":")) return null;

    const [coursePart, itemPart] = raw.split(":");
    const courseIndex = Number.parseInt(coursePart, 10);
    const itemIndex = Number.parseInt(itemPart, 10);
    if (Number.isNaN(courseIndex) || Number.isNaN(itemIndex)) return null;
    return { courseIndex, itemIndex };
  };

  const handleItemDragStart =
    (courseIndex: number, itemIndex: number) => (event: React.DragEvent) => {
      setDraggedItem({ courseIndex, itemIndex });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${courseIndex}:${itemIndex}`);
    };

  const handleItemDragEnd = () => {
    setDraggedItem(null);
    setDragOverTarget(null);
  };

  const handleItemDragOver =
    (courseIndex: number, itemIndex: number | null) => (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (!isDropTarget(courseIndex, itemIndex)) {
        setDragOverTarget({ courseIndex, itemIndex });
      }
    };

  const handleItemDrop =
    (toCourseIndex: number, toItemIndex: number | null) => (event: React.DragEvent) => {
      event.preventDefault();
      const source = draggedItem || parseDraggedItemFromDataTransfer(event);
      setDragOverTarget(null);
      if (!source) return;

      moveMenuItem(source.courseIndex, source.itemIndex, toCourseIndex, toItemIndex);
      setDraggedItem(null);
    };

  const handleVolunteerSignup = (itemName: string, name: string) => {
    setVolunteers(prev => ({ ...prev, [itemName]: name }));
  };

  const renderVolunteerControl = (itemName: string, compact = false) => {
    if (volunteers[itemName]) {
      return (
        <div className={cn("flex items-center gap-2", compact && "justify-between")}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#FFCC00]/20 flex items-center justify-center text-[#2E3192] text-xs font-bold">
              {volunteers[itemName].charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-[#2E3192]">{volunteers[itemName]}</span>
          </div>
          <button
            onClick={() => handleVolunteerSignup(itemName, "")}
            className="p-1 hover:text-red-500 text-black/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <div className={cn("flex gap-2", compact && "w-full")}>
        <input
          type="text"
          placeholder="Your Name"
          className={cn(
            "px-3 py-2 text-xs border border-black/5 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20",
            compact ? "flex-1" : "w-32"
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleVolunteerSignup(itemName, (e.target as HTMLInputElement).value);
            }
          }}
        />
        <button
          onClick={(e) => {
            const input = (e.currentTarget.previousSibling as HTMLInputElement);
            handleVolunteerSignup(itemName, input.value);
          }}
          className="p-2 bg-[#2E3192] text-white rounded-lg hover:bg-[#242776] transition-colors"
        >
          <UserPlus className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const exportToExcel = () => {
    if (!menu) return;

    // Prepare data for export
    const data = menu.courses.flatMap(course => 
      course.items.map(item => ({
        "Dish Name": item.name,
        "Quantity": `${item.trayMeasurement} (${item.estimatedQuantity})`,
        "Volunteer": volunteers[item.name] || "",
      }))
    );

    if (data.length === 0) {
      console.error("No data to export");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Menu Plan");
    
    // Auto-size columns for better readability
    const colWidths = [
      { wch: 30 }, // Dish Name
      { wch: 25 }, // Quantity
      { wch: 20 }, // Volunteer
    ];
    worksheet["!cols"] = colWidths;

    // Generate filename based on menu title
    const fileName = `${menu.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_menu.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const syncMenuToGoogleSheet = async () => {
    if (!menu || !selectedProgram) return;

    if (!MENU_API_URL.trim()) {
      setSheetSyncMessage("Menu API URL is not configured yet.");
      return;
    }

    setSyncingToSheet(true);
    setSheetSyncMessage(null);

    try {
      const payload = {
        programType: selectedProgram.name,
        courses: menu.courses,
        volunteers,
      };

      const candidateUrls = [MENU_API_URL];
      if (MENU_API_URL.includes("/api/menu")) {
        candidateUrls.push(MENU_API_URL.replace("/api/menu", "/menu"));
      }

      let syncSuccess = false;
      let lastFailureMessage = "Unknown error";

      for (const candidateUrl of candidateUrls) {
        try {
          const response = await fetch(candidateUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          const responseText = await response.text();
          if (response.ok) {
            syncSuccess = true;
            break;
          }

          const summary = responseText.slice(0, 160).replace(/\s+/g, " ").trim();
          lastFailureMessage = `${response.status}${summary ? ` ${summary}` : ""}`;
        } catch (innerErr) {
          lastFailureMessage =
            innerErr instanceof Error ? innerErr.message : "Network request failed";
        }
      }

      if (!syncSuccess) {
        throw new Error(lastFailureMessage);
      }

      setSheetSyncMessage("Menu sent to Google Sheets.");
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setSheetSyncMessage(`Sync failed: ${message}`);
    } finally {
      setSyncingToSheet(false);
    }
  };

  const fetchRecentCachedFoods = async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), MENU_CACHE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(MENU_API_URL, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return [];

      const payload = await response.json();
      const posts = Array.isArray(payload?.posts) ? payload.posts : [];
      const seen = new Set<string>();
      const foods: string[] = [];

      for (const post of posts) {
        const postFoods = Array.isArray(post?.foods) ? post.foods : [];
        for (const rawFood of postFoods) {
          const food = typeof rawFood === "string" ? rawFood.trim() : "";
          if (!food) continue;
          const key = normalizeDishNameForMatch(food);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          foods.push(food);
          if (foods.length >= MENU_CACHE_MAX_BLOCKLIST_ITEMS) return foods;
        }
      }

      return foods;
    } catch {
      return [];
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const addCustomRestriction = () => {
    const trimmed = newRestrictionInput.trim();
    if (!trimmed || customRestrictions.includes(trimmed)) return;
    setCustomRestrictions((prev) => [...prev, trimmed]);
    setNewRestrictionInput("");
  };

  const removeCustomRestriction = (restriction: string) => {
    setCustomRestrictions((prev) => prev.filter((item) => item !== restriction));
  };

  const extractJsonObject = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
  };

  const generateMenu = async () => {
    setLoading(true);
    setError(null);
    setSheetSyncMessage(null);
    if (!selectedProgram) {
      setError("Please select a program type.");
      setLoading(false);
      return;
    }
    if (peopleCount <= 0) {
      setError("Please enter the number of guests.");
      setLoading(false);
      return;
    }
    if (selectedCuisines.length === 0) {
      setError("Please choose at least one cuisine.");
      setLoading(false);
      return;
    }
    try {
      const finalCuisine = selectedCuisines.join(", ");
      const allRestrictions = [...MANDATORY_RESTRICTIONS, ...customRestrictions];
      const programTrayRule = PROGRAM_TRAY_RULES[selectedProgram.id];
      const itemRange = getMenuItemRange(selectedProgram.id, peopleCount);
      const blockedFoods = await fetchRecentCachedFoods();
      const blockedFoodKeys = new Set(blockedFoods.map((food) => normalizeDishNameForMatch(food)));
      const blockedFoodsInstruction =
        blockedFoods.length > 0
          ? `Avoid repeating these previously used dishes (exact or near-exact names): ${blockedFoods.join(", ")}.`
          : "No prior dishes are available in cache yet.";
      const hasManualTrayOverride =
        selectedProgram.id === "other" &&
        /\btray|trays|large|small|medium|portion|serving\b/i.test(additionalInstructions);
      const shouldEnforceTrayRule = selectedProgram.id !== "other" || !hasManualTrayOverride;
      const trayRuleInstruction =
        selectedProgram.id === "other"
          ? "Default to 1 Small Tray per item. Only use a different tray quantity/size if explicitly asked in Additional Instructions."
          : `Use exactly ${programTrayRule} for every item in this program.`;

      const prompt = `Generate a detailed menu plan for a group of ${peopleCount} people.
          Program Type: ${selectedProgram.name}
          Cuisine Mix: ${finalCuisine}
          Mandatory Dietary Restrictions: ${allRestrictions.join(", ")}
          Tray Rule (MANDATORY): ${trayRuleInstruction}
          Dish Count Rule (MANDATORY): Return between ${itemRange.minItems} and ${itemRange.maxItems} total dishes across all courses.
          Repetition Rule (MANDATORY): ${blockedFoodsInstruction}
          Additional Instructions: ${additionalInstructions || "None"}

          Program-specific guidance:
          ${selectedProgram.guidance}
          
          Course buckets you can use when relevant:
          - Appetizers
          - Main Course
          - Sides/Accompaniments
          - Desserts
          Use only the buckets that make sense for the event size. Do not force all four.
          At least one Main Course item is required.
          Keep the menu practical for ${peopleCount} people. Fewer well-planned dishes are better than many redundant dishes.
          
          CRITICAL: For each item, provide:
          - A description
          - Estimated raw quantities (e.g., "5kg Paneer")
          - Tray measurements (e.g., "2 Large Trays", "1 Medium Tray", "3 Small Trays") based on standard catering tray sizes.

          NON-NEGOTIABLE: All dishes must be strictly vegetarian, no onion, no garlic, no eggs, no mushrooms, no fish oils, and no cheeses with animal enzymes.
          
          Also provide 3-4 professional tips for managing this specific menu for a large group.`;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), MENU_GENERATION_TIMEOUT_MS);
      const response = await (async () => {
        try {
          return await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              "HTTP-Referer": window.location.origin,
              "X-Title": "Bhojan Planner",
            },
            body: JSON.stringify({
              model: OPENROUTER_MODEL,
              temperature: 0.15,
              max_tokens: MENU_GENERATION_MAX_TOKENS,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content:
                    "Return only valid JSON with this exact shape: {\"title\":string,\"cuisine\":string,\"groupSize\":number,\"preferences\":string[],\"courses\":[{\"category\":string,\"items\":[{\"name\":string,\"description\":string,\"estimatedQuantity\":string,\"trayMeasurement\":string}]}],\"tips\":string[]}. No markdown. Keep descriptions short and practical.",
                },
                { role: "user", content: prompt },
              ],
            }),
          });
        } finally {
          window.clearTimeout(timeoutId);
        }
      })();

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const rawContent = data?.choices?.[0]?.message?.content;
      const content =
        typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n")
            : "";

      const parsed = JSON.parse(extractJsonObject(content));
      const normalizedCourses = Array.isArray(parsed?.courses)
        ? parsed.courses.map((course: any) => ({
            category: typeof course?.category === "string" ? course.category : "Course",
            items: Array.isArray(course?.items)
              ? course.items.map((item: any) => ({
                  name: typeof item?.name === "string" ? item.name : "Menu Item",
                  description: typeof item?.description === "string" ? item.description : "",
                  estimatedQuantity:
                    typeof item?.estimatedQuantity === "string" ? item.estimatedQuantity : "",
                  trayMeasurement: shouldEnforceTrayRule
                    ? programTrayRule
                    : (typeof item?.trayMeasurement === "string" && item.trayMeasurement.trim()) || "1 Small Tray",
                }))
              : [],
          }))
        : [];
      const nonRepeatedCourses = normalizedCourses
        .map((course) => ({
          ...course,
          items: course.items.filter(
            (item) => !blockedFoodKeys.has(normalizeDishNameForMatch(item.name))
          ),
        }))
        .filter((course) => course.items.length > 0);
      const constrainedCourses = dedupeAndCapCourses(nonRepeatedCourses, itemRange.maxItems);
      if (constrainedCourses.length === 0) {
        throw new Error("No unique dishes available after applying menu-cache exclusions.");
      }

      const normalizedResult: MenuPlan = {
        title: parsed?.title || `${selectedProgram.name} Menu Plan`,
        cuisine: parsed?.cuisine || finalCuisine,
        groupSize: Number(parsed?.groupSize) || peopleCount,
        preferences: Array.isArray(parsed?.preferences) ? parsed.preferences : allRestrictions,
        courses: constrainedCourses,
        tips: Array.isArray(parsed?.tips) ? parsed.tips : [],
      };

      setMenu(normalizedResult);
      setVolunteers({}); // Reset volunteers on new menu
      setItemEditor(null);
      setItemEditorError(null);
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.name === "AbortError") {
        setError("Menu generation exceeded 6 seconds. Try again or reduce menu complexity.");
      } else if (
        err instanceof Error &&
        err.message.includes("No unique dishes available after applying menu-cache exclusions")
      ) {
        setError(
          "Model repeated cached dishes. Try generating again or clear old menu cache entries."
        );
      } else {
        setError("Failed to generate menu from OpenRouter. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1F2937] font-sans selection:bg-[#FFCC00] selection:text-[#2E3192] relative overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {isMobileDevice ? (
          <>
            <div className={cn("absolute -top-24 -left-24 w-80 h-80 rounded-full blur-[100px] opacity-15 transition-colors duration-1000", activeCuisine.color)} />
            <div className="absolute top-1/2 -right-20 w-64 h-64 bg-[#FFCC00] rounded-full blur-[90px] opacity-10" />
          </>
        ) : (
          <>
            <motion.div 
              animate={{ 
                scale: [1, 1.2, 1],
                x: [0, 50, 0],
                y: [0, -30, 0]
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className={cn("absolute -top-24 -left-24 w-96 h-96 rounded-full blur-[120px] opacity-20 transition-colors duration-1000", activeCuisine.color)} 
            />
            <motion.div 
              animate={{ 
                scale: [1, 1.1, 1],
                x: [0, -40, 0],
                y: [0, 60, 0]
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              className="absolute top-1/2 -right-24 w-80 h-80 bg-[#FFCC00] rounded-full blur-[100px] opacity-10" 
            />
            <motion.div 
              animate={{ 
                scale: [1, 1.3, 1],
                x: [0, 30, 0],
                y: [0, 40, 0]
              }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute -bottom-24 left-1/2 w-96 h-96 bg-[#6d1ed1] rounded-full blur-[120px] opacity-10" 
            />
          </>
        )}
      </div>

      {/* Header */}
      <header className="border-b border-black/5 bg-white/60 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div 
              layout
              className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-500 shadow-lg", activeCuisine.color)}
            >
              <ChefHat className="text-white w-5 h-5" />
            </motion.div>
            <span className="font-bold text-xl tracking-tight">Bhojan</span>
          </div>
          <div className="hidden sm:block text-xs font-bold uppercase tracking-widest text-black/40">
            Professional Group Menu Planner
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 relative z-10">
        {!selectedProgram ? (
          <section className="space-y-8 sm:space-y-10">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-4xl sm:text-5xl font-light tracking-tight mb-4">
                Welcome to <span className="font-serif italic text-[#2E3192]">Bhojan Planner</span>
              </h1>
              <p className="text-black/60 text-base sm:text-lg leading-relaxed">
                Select the Namadwaar program you are preparing for. We will auto-populate menu planning defaults, quantities, and guidance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PROGRAM_TEMPLATES.map((program) => {
                const programTheme = PROGRAM_THEMES[program.id];
                return (
                  <button
                    key={program.id}
                    onClick={() => handleProgramSelect(program.id)}
                    className={cn(
                      "text-left p-6 rounded-2xl border bg-white hover:shadow-md transition-all",
                      programTheme.border
                    )}
                  >
                    <h2 className={cn("text-2xl font-serif italic mb-2", programTheme.text)}>{program.name}</h2>
                    <p className="text-sm text-black/60">{program.description}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Left Column: Form */}
          <div className="lg:col-span-5 space-y-6 sm:space-y-8">
            <section>
              <div className="flex items-start justify-between gap-3 mb-3">
                <h1 className="text-3xl sm:text-4xl font-light tracking-tight leading-tight">
                  Plan for <br />
                  <span className={cn("italic font-serif transition-colors duration-500", activeCuisine.text)}>{selectedProgram.name}</span>
                </h1>
                <button
                  onClick={() => setSelectedProgramId(null)}
                  className="px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-[#2E3192]/20 text-[#2E3192] hover:bg-[#2E3192]/5"
                >
                  Change
                </button>
              </div>
              <p className="text-black/60 leading-relaxed max-w-md">
                {selectedProgram.description}
              </p>
            </section>

            <div className="space-y-6">
              {/* Cuisine Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <Utensils className="w-3 h-3" /> Cuisines (Select Multiple)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CUISINES.map((cuisineName) => (
                    <button
                      key={cuisineName}
                      onClick={() => toggleCuisine(cuisineName)}
                      className={cn(
                        "px-4 py-3 rounded-xl border text-sm transition-all duration-300 text-left",
                        selectedCuisines.includes(cuisineName)
                          ? "bg-white border-[#2E3192] text-[#2E3192] font-bold ring-2 ring-[#2E3192]/20 shadow-md scale-[1.02]"
                          : "bg-white border-black/5 hover:border-black/20 text-black/70"
                      )}
                    >
                      {cuisineName}
                    </button>
                  ))}
                </div>

                {selectedCuisines.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedCuisines.map((cuisineName) => (
                      <span
                        key={cuisineName}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#2E3192]/10 border border-[#2E3192]/20 text-[#2E3192] rounded-full text-xs font-medium"
                      >
                        {cuisineName}
                        <button
                          onClick={() => removeCuisine(cuisineName)}
                          className="hover:text-[#242776]"
                          aria-label={`Remove ${cuisineName}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add custom cuisine..."
                    value={newCuisineInput}
                    onChange={(e) => setNewCuisineInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomCuisine()}
                    className="flex-1 px-4 py-2 rounded-xl border border-black/5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20 focus:border-[#2E3192] transition-all text-sm"
                  />
                  <button
                    onClick={addCustomCuisine}
                    className="px-4 py-2 bg-[#2E3192] text-white rounded-xl text-sm font-medium hover:bg-[#242776] transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Group Size */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <Users className="w-3 h-3" /> Number of People
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={peopleInput}
                    onChange={(e) => handlePeopleChange(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-black/5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20 focus:border-[#2E3192] transition-all text-lg font-medium"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-black/30 text-sm font-medium">
                    Guests
                  </div>
                </div>
              </div>

              {/* Dietary Rules */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" /> Mandatory Dietary Rules
                </label>
                <div className="flex flex-wrap gap-2">
                  {MANDATORY_RESTRICTIONS.map((rule) => (
                    <span
                      key={rule}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#FFCC00]/20 border border-[#FFCC00]/30 text-[#2E3192] rounded-full text-xs font-bold"
                    >
                      {rule}
                    </span>
                  ))}
                </div>

                <label className="text-[10px] font-bold uppercase tracking-wider text-black/40 pt-2 block">
                  Optional Additional Restrictions
                </label>
                {customRestrictions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {customRestrictions.map((restriction) => (
                      <span 
                        key={restriction}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#FFCC00]/20 border border-[#FFCC00]/30 text-[#2E3192] rounded-full text-xs font-medium"
                      >
                        {restriction}
                        <button 
                          onClick={() => removeCustomRestriction(restriction)}
                          className="hover:text-[#242776]"
                        >
                          <Ban className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Add Custom Restriction Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add restriction..."
                    value={newRestrictionInput}
                    onChange={(e) => setNewRestrictionInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomRestriction()}
                    className="flex-1 px-4 py-2 rounded-xl border border-black/5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20 focus:border-[#2E3192] transition-all text-sm"
                  />
                  <button
                    onClick={addCustomRestriction}
                    className="px-4 py-2 bg-[#2E3192] text-white rounded-xl text-sm font-medium hover:bg-[#242776] transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Additional Instructions */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                  <ChefHat className="w-3 h-3" /> Additional Instructions
                </label>
                <textarea
                  placeholder="Any specific requests? (e.g. 'Include a spicy option', 'Focus on seasonal vegetables', 'Kid-friendly items')"
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-black/5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20 focus:border-[#2E3192] transition-all text-sm min-h-[100px] resize-none"
                />
              </div>

              <button
                onClick={generateMenu}
                disabled={loading || peopleCount <= 0 || selectedCuisines.length === 0}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-500 disabled:opacity-50 group shadow-xl shadow-black/5 bg-[#FFCC00] text-[#2E3192] hover:bg-[#f2c100] hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Crafting Menu...
                  </>
                ) : (
                  <>
                    Generate Menu
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Result */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {menu ? (
                <motion.div
                  key="menu"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white border border-black/5 rounded-[32px] shadow-xl shadow-black/[0.02] overflow-hidden"
                >
                  {/* Menu Header */}
                  <div className={cn("p-8 border-b border-black/5 transition-colors duration-1000", activeCuisine.light)}>
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-0 mb-6">
                      <div>
                        <h2 className="text-4xl font-serif italic mb-3">{menu.title}</h2>
                        <div className="flex flex-wrap gap-2">
                          <span className={cn("px-3 py-1.5 bg-white/80 backdrop-blur-sm border rounded-full text-[10px] uppercase font-bold tracking-wider shadow-sm", activeCuisine.text, activeCuisine.border)}>
                            {menu.cuisine}
                          </span>
                          <span className="px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-black/5 rounded-full text-[10px] uppercase font-bold tracking-wider text-black/50 shadow-sm">
                            {menu.groupSize} Guests
                          </span>
                          {menu.preferences.map(p => (
                            <span key={p} className="px-3 py-1.5 bg-[#FFCC00]/20 text-[#2E3192] border border-[#FFCC00]/30 rounded-full text-[10px] uppercase font-bold tracking-wider shadow-sm">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 self-end sm:self-auto">
                        <div className="flex gap-2">
                        <button 
                          onClick={exportToExcel}
                          title="Export to Excel"
                          className="p-3 bg-white/80 backdrop-blur-sm hover:bg-white rounded-xl transition-all border border-black/5 shadow-sm hover:shadow-md active:scale-95 flex items-center gap-2 group"
                        >
                          <FileSpreadsheet className="w-5 h-5 text-[#2E3192]" />
                          <span className="text-xs font-bold text-black/60 hidden sm:inline">Excel</span>
                        </button>
                        <button
                          onClick={syncMenuToGoogleSheet}
                          disabled={syncingToSheet}
                          title="Send to Google Sheets"
                          className="p-3 bg-white/80 backdrop-blur-sm hover:bg-white rounded-xl transition-all border border-black/5 shadow-sm hover:shadow-md active:scale-95 disabled:opacity-60 flex items-center gap-2"
                        >
                          <Share2 className="w-5 h-5 text-black/60" />
                          <span className="text-xs font-bold text-black/60 hidden sm:inline">
                            Send to Google Sheets
                          </span>
                        </button>
                        </div>
                        {(syncingToSheet || sheetSyncMessage) && (
                          <p className="text-[10px] font-bold uppercase tracking-wider text-black/45 max-w-[180px] text-right">
                            {syncingToSheet ? "Sending to Google Sheets..." : sheetSyncMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu Content */}
                  <div className="p-4 sm:p-8 space-y-8 sm:space-y-12">
                    {menu.courses.map((course, idx) => (
                      <section key={idx} className="space-y-6">
                        <div className="flex items-center gap-4">
                          <h3 className={cn("text-xs font-bold uppercase tracking-[0.3em] whitespace-nowrap", activeCuisine.text)}>
                            {course.category}
                          </h3>
                          <div className={cn("h-px w-full opacity-20", activeCuisine.color)} />
                          <button
                            onClick={() => openAddItemEditor(idx)}
                            className="px-3 py-1.5 rounded-lg border border-[#2E3192]/20 text-[#2E3192] text-[10px] font-bold uppercase tracking-wider hover:bg-[#2E3192]/5 transition-colors whitespace-nowrap"
                          >
                            Add Item
                          </button>
                        </div>

                        {itemEditor?.courseIndex === idx && (
                          <div className="rounded-2xl border border-black/10 bg-black/[0.015] p-4 sm:p-5 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-sm font-bold text-[#2E3192] uppercase tracking-wider">
                                {itemEditor.mode === "add" ? "Add Menu Item" : "Edit Menu Item"}
                              </h4>
                              <button
                                onClick={closeItemEditor}
                                className="p-1.5 rounded-md text-black/40 hover:text-black/70 hover:bg-black/5 transition-colors"
                                aria-label="Close editor"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                type="text"
                                value={itemEditor.draft.name}
                                onChange={(e) => updateItemEditorField("name", e.target.value)}
                                placeholder="Dish name"
                                className="px-3 py-2 text-sm border border-black/10 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20"
                              />
                              <input
                                type="text"
                                value={itemEditor.draft.estimatedQuantity}
                                onChange={(e) => updateItemEditorField("estimatedQuantity", e.target.value)}
                                placeholder="Estimated quantity"
                                className="px-3 py-2 text-sm border border-black/10 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20"
                              />
                              <input
                                type="text"
                                value={itemEditor.draft.trayMeasurement}
                                onChange={(e) => updateItemEditorField("trayMeasurement", e.target.value)}
                                placeholder="Tray measurement"
                                className="px-3 py-2 text-sm border border-black/10 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20"
                              />
                            </div>

                            <textarea
                              value={itemEditor.draft.description}
                              onChange={(e) => updateItemEditorField("description", e.target.value)}
                              placeholder="Dish description"
                              className="w-full min-h-[90px] px-3 py-2 text-sm border border-black/10 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2E3192]/20 resize-none"
                            />

                            {itemEditorError && (
                              <p className="text-xs text-red-600 font-medium">{itemEditorError}</p>
                            )}

                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={closeItemEditor}
                                className="px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-black/15 text-black/60 hover:bg-black/5 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveItemEditor}
                                className="px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-[#2E3192] text-white hover:bg-[#242776] transition-colors"
                              >
                                {itemEditor.mode === "add" ? "Add Dish" : "Save Changes"}
                              </button>
                            </div>
                          </div>
                        )}

                        {isMobileDevice ? (
                          <div className="space-y-3">
                            {course.items.map((item, iIdx) => (
                              <article
                                key={iIdx}
                                draggable
                                onDragStart={handleItemDragStart(idx, iIdx)}
                                onDragEnd={handleItemDragEnd}
                                onDragOver={handleItemDragOver(idx, iIdx)}
                                onDrop={handleItemDrop(idx, iIdx)}
                                className={cn(
                                  "rounded-2xl border border-black/10 bg-white p-4 space-y-3 shadow-sm cursor-move",
                                  isDropTarget(idx, iIdx) && "border-[#2E3192] bg-[#2E3192]/5"
                                )}
                              >
                                <div>
                                  <h4 className="font-bold text-base text-[#2E3192] mb-1">{item.name}</h4>
                                  <p className="text-sm text-black/50 leading-relaxed">{item.description}</p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={cn("text-xs font-bold px-2 py-1 rounded-md inline-block", activeCuisine.light, activeCuisine.text)}>
                                    {item.trayMeasurement}
                                  </span>
                                  <span className="text-[11px] font-mono text-black/40">({item.estimatedQuantity})</span>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-[10px] uppercase tracking-widest font-bold text-black/40">Volunteer</p>
                                  {renderVolunteerControl(item.name, true)}
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    onClick={() => openEditItemEditor(idx, iIdx)}
                                    className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md border border-[#2E3192]/25 text-[#2E3192] hover:bg-[#2E3192]/5 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => deleteMenuItem(idx, iIdx)}
                                    className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </article>
                            ))}
                            <div
                              onDragOver={handleItemDragOver(idx, null)}
                              onDrop={handleItemDrop(idx, null)}
                              className={cn(
                                "rounded-xl border border-dashed border-black/15 px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-black/35 text-center",
                                isDropTarget(idx, null) && "border-[#2E3192] text-[#2E3192] bg-[#2E3192]/5"
                              )}
                            >
                              Drop Here To Move Item To End Of {course.category}
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-black/5">
                                  <th className="py-4 px-4 text-[10px] uppercase font-bold tracking-wider text-black/40">Dish Name</th>
                                  <th className="py-4 px-4 text-[10px] uppercase font-bold tracking-wider text-black/40">Quantity / Tray</th>
                                  <th className="py-4 px-4 text-[10px] uppercase font-bold tracking-wider text-black/40">Volunteer</th>
                                </tr>
                              </thead>
                              <tbody>
                                {course.items.map((item, iIdx) => (
                                  <tr
                                    key={iIdx}
                                    draggable
                                    onDragStart={handleItemDragStart(idx, iIdx)}
                                    onDragEnd={handleItemDragEnd}
                                    onDragOver={handleItemDragOver(idx, iIdx)}
                                    onDrop={handleItemDrop(idx, iIdx)}
                                    className={cn(
                                      "group border-b border-black/5 hover:bg-black/[0.01] transition-colors cursor-move",
                                      isDropTarget(idx, iIdx) && "bg-[#2E3192]/5"
                                    )}
                                  >
                                    <td className="py-6 px-4">
                                      <div className="font-bold text-lg mb-1 group-hover:text-[#2E3192] transition-colors">{item.name}</div>
                                      <p className="text-sm text-black/40 leading-relaxed max-w-xs">{item.description}</p>
                                      <div className="flex items-center gap-2 mt-3">
                                        <button
                                          onClick={() => openEditItemEditor(idx, iIdx)}
                                          className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md border border-[#2E3192]/25 text-[#2E3192] hover:bg-[#2E3192]/5 transition-colors"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => deleteMenuItem(idx, iIdx)}
                                          className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </td>
                                    <td className="py-6 px-4">
                                      <div className="flex flex-col gap-1">
                                        <span className={cn("text-xs font-bold px-2 py-1 rounded-md inline-block w-fit", activeCuisine.light, activeCuisine.text)}>
                                          {item.trayMeasurement}
                                        </span>
                                        <span className="text-[10px] font-mono text-black/30">
                                          ({item.estimatedQuantity})
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-6 px-4">
                                      {renderVolunteerControl(item.name)}
                                    </td>
                                  </tr>
                                ))}
                                <tr
                                  onDragOver={handleItemDragOver(idx, null)}
                                  onDrop={handleItemDrop(idx, null)}
                                  className={cn(
                                    "border-b border-black/5",
                                    isDropTarget(idx, null) && "bg-[#2E3192]/5"
                                  )}
                                >
                                  <td colSpan={3} className="py-3 px-4 text-[10px] uppercase tracking-wider font-bold text-black/35">
                                    Drop Here To Move Item To End Of {course.category}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    ))}

                    {/* Tips Section */}
                    <section className={cn("p-8 rounded-[24px] text-white shadow-2xl relative overflow-hidden", activeCuisine.color)}>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-12 -mb-12 blur-xl" />
                      
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/60 mb-6 relative z-10">
                        Chef's Tips for Success
                      </h3>
                      <ul className="space-y-4 relative z-10">
                        {menu.tips.map((tip, idx) => (
                          <li key={idx} className="flex gap-4 text-base leading-relaxed text-white/90">
                            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
                              {idx + 1}
                            </span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full min-h-[420px] sm:min-h-[600px] border-2 border-dashed border-black/5 rounded-[32px] flex flex-col items-center justify-center text-center p-8 sm:p-12"
                >
                  <div className="w-20 h-20 bg-black/5 rounded-full flex items-center justify-center mb-6">
                    <Utensils className="w-8 h-8 text-black/20" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">No menu generated yet</h3>
                  <p className="text-black/40 max-w-xs mx-auto">
                    Fill out the form on the left to generate a professional menu for your event.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 border-t border-black/5 text-center">
        <p className="text-xs font-medium text-black/30 uppercase tracking-widest">
          Powered by OpenRouter • Crafted for Food Lovers
        </p>
      </footer>
    </div>
  );
}
