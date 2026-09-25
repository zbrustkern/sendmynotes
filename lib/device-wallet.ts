"use client";

import { useState, useEffect } from "react";

export type DeviceWalletType = "apple" | "google" | "instant";

export interface DeviceWalletInfo {
  type: DeviceWalletType;
  walletName: string;
  badgeText: string;
  heroCallout: string;
  stepLabel: string;
  checkoutButtonLabel: string;
  paymentNotice: string;
  isApple: boolean;
  isAndroid: boolean;
}

/**
 * Detects whether the visitor is on an Apple device (iOS/macOS),
 * an Android device, or a standard desktop/other device.
 */
export function detectDeviceWallet(): DeviceWalletType {
  if (typeof window === "undefined" || !navigator) return "instant";

  const ua = navigator.userAgent || "";
  const isApple = /iPhone|iPad|iPod|Macintosh/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  if (isApple) return "apple";
  if (isAndroid) return "google";
  return "instant";
}

/**
 * React hook providing device-tailored copy, badges, and button labels
 * to maximize impulse conversions without confusing non-Apple/non-Android users.
 */
export function useDeviceWallet(): DeviceWalletInfo {
  const [walletType, setWalletType] = useState<DeviceWalletType>("instant");

  useEffect(() => {
    setWalletType(detectDeviceWallet());
  }, []);

  if (walletType === "apple") {
    return {
      type: "apple",
      walletName: "Apple Pay",
      badgeText: "Apple Pay Ready • No Account",
      heroCallout: "No stamps, no account, 1-tap Apple Pay.",
      stepLabel: "4. Apple Pay",
      checkoutButtonLabel: "Send with Apple Pay ($9.00)",
      paymentNotice: "Apple Pay active on your device. Double-click to complete with Touch ID / Face ID.",
      isApple: true,
      isAndroid: false,
    };
  }

  if (walletType === "google") {
    return {
      type: "google",
      walletName: "Google Pay",
      badgeText: "Google Pay Ready • No Account",
      heroCallout: "No stamps, no account, 1-tap Google Pay.",
      stepLabel: "4. Google Pay",
      checkoutButtonLabel: "Send with Google Pay ($9.00)",
      paymentNotice: "Google Pay active on your device. Tap to complete with your saved Google Wallet.",
      isApple: false,
      isAndroid: true,
    };
  }

  return {
    type: "instant",
    walletName: "Instant Checkout",
    badgeText: "60-Sec Checkout • No Account",
    heroCallout: "No stamps, no account, instant 1-click checkout.",
    stepLabel: "4. Instant Pay",
    checkoutButtonLabel: "Send Handwritten Card ($9.00)",
    paymentNotice: "Zero account required. Pay instantly with any major credit or debit card.",
    isApple: false,
    isAndroid: false,
  };
}
