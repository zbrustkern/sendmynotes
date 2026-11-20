"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { OrderTracker } from "./OrderTracker";

export default function OrderStatusPage() {
  const { id } = useParams<{ id: string }>();
  const [navigation, setNavigation] = useState(0);
  useEffect(() => {
    const refreshEntry = () => setNavigation((value) => value + 1);
    const refreshFragment = (event: HashChangeEvent) => {
      if (event.newURL === window.location.href) refreshEntry();
    };
    window.addEventListener("hashchange", refreshFragment);
    window.addEventListener("popstate", refreshEntry);
    return () => {
      window.removeEventListener("hashchange", refreshFragment);
      window.removeEventListener("popstate", refreshEntry);
    };
  }, []);
  return <OrderTracker key={`${id}:${navigation}`} orderId={id} />;
}
