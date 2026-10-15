import { NextRequest, NextResponse } from "next/server";
import { getSystemConfig, setSystemConfig } from "@/lib/firebase-admin";

const REGISTRY_CONFIG_KEY = "founder_device_registry";

export interface FounderDeviceRegistry {
  clientIds: string[];
  sessionIds: string[];
  updatedAt: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim().slice(0, 100) : "";
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim().slice(0, 100) : "";

    const rawRegistry = (await getSystemConfig<any>(REGISTRY_CONFIG_KEY)) || {};
    const registry: FounderDeviceRegistry = {
      clientIds: Array.isArray(rawRegistry.clientIds) ? [...rawRegistry.clientIds] : [],
      sessionIds: Array.isArray(rawRegistry.sessionIds) ? [...rawRegistry.sessionIds] : [],
      updatedAt: Date.now(),
    };

    if (clientId && !registry.clientIds.includes(clientId)) {
      registry.clientIds.push(clientId);
    }
    if (sessionId && !registry.sessionIds.includes(sessionId)) {
      registry.sessionIds.push(sessionId);
    }
    registry.updatedAt = Date.now();

    // Explicitly overwrite to purge any legacy IP or userAgent matching arrays
    await setSystemConfig(REGISTRY_CONFIG_KEY, {
      clientIds: registry.clientIds,
      sessionIds: registry.sessionIds,
      updatedAt: registry.updatedAt,
    });

    const res = NextResponse.json({
      success: true,
      message: "Browser marked as Founder Device. Test sessions from this client ID will be cleanly separated without IP proxy contamination.",
      registeredClientId: clientId,
      registeredSession: sessionId,
    });

    res.cookies.set("smn_founder_device", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365 * 2, // 2 years
      sameSite: "lax",
    });

    return res;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error registering founder device";
    console.error("[Founder Device Registry Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const rawRegistry = (await getSystemConfig<any>(REGISTRY_CONFIG_KEY)) || {};
  const registry: FounderDeviceRegistry = {
    clientIds: Array.isArray(rawRegistry.clientIds) ? rawRegistry.clientIds : [],
    sessionIds: Array.isArray(rawRegistry.sessionIds) ? rawRegistry.sessionIds : [],
    updatedAt: typeof rawRegistry.updatedAt === "number" ? rawRegistry.updatedAt : 0,
  };
  return NextResponse.json(registry);
}
