import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Car from '../db/models/Car';
import { observeAllCars } from '../db/queries';

interface ActiveCarContextValue {
  cars: Car[];
  activeCar: Car | null;
  activeCarId: string | null;
  setActiveCarId: (id: string) => void;
  loading: boolean;
}

const ActiveCarContext = createContext<ActiveCarContextValue | null>(null);

export function ActiveCarProvider({ children }: { children: ReactNode }) {
  const [cars, setCars] = useState<Car[]>([]);
  const [activeCarId, setActiveCarId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = observeAllCars().subscribe((list) => {
      setCars(list);
      setLoading(false);
      // Если активное авто ещё не выбрано (или было удалено) — берём первое в гараже.
      setActiveCarId((current) => {
        if (current && list.some((c) => c.id === current)) return current;
        return list[0]?.id ?? null;
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  const activeCar = cars.find((c) => c.id === activeCarId) ?? null;

  return (
    <ActiveCarContext.Provider value={{ cars, activeCar, activeCarId, setActiveCarId, loading }}>
      {children}
    </ActiveCarContext.Provider>
  );
}

export function useActiveCar() {
  const ctx = useContext(ActiveCarContext);
  if (!ctx) throw new Error('useActiveCar must be used within ActiveCarProvider');
  return ctx;
}
