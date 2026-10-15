import { NextRequest, NextResponse } from "next/server";
import { getSystemConfig, setSystemConfig } from "@/lib/firebase-admin";

const REGISTRY_CONFIG_KEY = "founder_device_registry";

export interface FounderDeviceRegistry {
  ips: string[];
  sessionIds: string[];
  userAgents: string[];
  updatedAt: number;
}

export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId || "";

    const registry = (await getSystemConfig<FounderDeviceRegistry>(REGISTRY_CONFIG_KEY)) || {
      ips: [],
      sessionIds: [],
      userAgents: [],
      updatedAt: Date.now(),
    };

    if (clientIp && !registry.ips.includes(clientIp)) {
      registry.ips.push(clientIp);
    }
    if (sessionId && !registry.sessionIds.includes(sessionId)) {
      registry.sessionIds.push(sessionId);
    }
    if (userAgent && !registry.userAgents.includes(userAgent)) {
      registry.userAgents.push(userAgent);
    }
    registry.updatedAt = Date.now();

    await setSystemConfig(REGISTRY_CONFIG_KEY, registry as unknown as Record<string, unknown>);

    const res = NextResponse.json({
      success: true,
      message: "Browser marked as Founder Device. Test sessions from this device will be cleanly separated.",
      registeredIp: clientIp,
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
  const registry = (await getSystemConfig<FounderDeviceRegistry>(REGISTRY_CONFIG_KEY)) || {
    ips: [],
    sessionIds: [],
    userAgents: [],
    updatedAt: 0,
  };
  return NextResponse.json(registry);
}
