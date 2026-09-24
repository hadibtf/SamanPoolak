import { useEffect, useRef } from 'react';
import { db } from '../db';
import { productionApi, getToken } from '../api/client';

export function useEmployeeSync() {
  const running = useRef(false);
  useEffect(() => {
    const sync = async () => { if (running.current || !getToken() || !navigator.onLine) return; running.current = true; try { const { productionTasks } = await productionApi.listTasks(); await db.productionTasks.clear(); if (productionTasks?.length) await db.productionTasks.bulkPut(productionTasks); } finally { running.current = false; } };
    sync(); const interval = window.setInterval(sync, 15000); window.addEventListener('focus', sync); return () => { window.clearInterval(interval); window.removeEventListener('focus', sync); };
  }, []);
}
