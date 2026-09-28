export type ServiceType =
  | 'oil'
  | 'filter'
  | 'brakes'
  | 'tires'
  | 'alignment'
  | 'battery'
  | 'inspection'
  | 'repair'
  | 'other';

export type FluidType =
  | 'engine_oil'
  | 'transmission'
  | 'brake'
  | 'coolant'
  | 'power_steering';

export type ExpenseCategory =
  | 'fuel'
  | 'wash'
  | 'parts'
  | 'repair'
  | 'insurance'
  | 'tax'
  | 'fine'
  | 'parking'
  | 'toll'
  | 'other';

export type ReminderTriggerType = 'mileage' | 'date' | 'both';
export type ReminderStatus = 'active' | 'done' | 'dismissed';
export type RecordSource = 'manual' | 'obd2';

export interface Garage {
  id: string;
  ownerId: string;
  members: string[];
  createdAt: string; // ISO
}

export interface Car {
  id: string;
  garageId: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  plateNumber?: string;
  photoUrl?: string;
  currentMileage: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecord {
  id: string;
  carId: string;
  date: string;
  mileage: number;
  type: ServiceType;
  fluidType?: FluidType;
  cost: number;
  serviceName?: string;
  photos: string[];
  source: RecordSource;
  createdAt: string;
}

export interface Expense {
  id: string;
  carId: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  fuelVolume?: number;
  fuelPrice?: number;
  notes?: string;
  photoUrl?: string;
}

export interface Reminder {
  id: string;
  carId: string;
  type: ReminderTriggerType;
  targetMileage?: number;
  targetDate?: string;
  relatedFluidType?: FluidType;
  status: ReminderStatus;
  calendarSynced: boolean;
}

export interface Obd2Snapshot {
  id: string;
  carId: string;
  mileage: number;
  timestamp: string;
  errorCodes: string[];
  deviceId: string;
}

export interface TransferLink {
  id: string;
  carId: string;
  createdBy: string;
  expiresAt: string;
  token: string;
}
