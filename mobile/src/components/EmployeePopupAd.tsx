import React, { useEffect, useState } from 'react';
import PopupAd from './PopupAd';
import { fetchEmployeePopupAd } from '../api/employeeExtra';
import { LandingAd } from '../api/landing';

// Shown at most once per app session, however many times the dashboard mounts.
let shownThisSession = false;

// The admin's employee-portal popup (placement popup_employee). Stays silent
// when there is none or the request fails — a missing ad must never get in the
// way of clocking in.
export default function EmployeePopupAd() {
  const [ad, setAd] = useState<LandingAd | null>(null);

  useEffect(() => {
    if (shownThisSession) return;
    let cancelled = false;
    fetchEmployeePopupAd()
      .then((row) => {
        if (cancelled || !row) return;
        shownThisSession = true;
        setAd({ id: row.id, url: row.url, kind: 'image', placement: 'popup_employee' });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <PopupAd ad={ad} onDismiss={() => setAd(null)} />;
}
