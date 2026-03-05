export interface MenuItem {
  name: string;
  description: string;
  estimatedQuantity: string;
  trayMeasurement: string;
  volunteer?: string;
}

export interface MenuPlan {
  title: string;
  cuisine: string;
  groupSize: number;
  preferences: string[];
  courses: {
    category: string;
    items: MenuItem[];
  }[];
  tips: string[];
}
