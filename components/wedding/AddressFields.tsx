"use client";
import { useEffect, useState } from "react";
import { blankAddress, type Address } from "./client";
type Destination = {
  countryCode: string;
  countryName: string;
  available: boolean;
  regionRequired?: boolean;
  postalCodeRequired?: boolean;
  regions?: { code: string; name: string }[];
};
export function AddressFields({
  value = blankAddress,
  onChange,
  domestic = false,
}: {
  value: Address;
  onChange: (v: Address) => void;
  domestic?: boolean;
}) {
  const [options, setOptions] = useState<Destination[]>([]);
  useEffect(() => {
    if (domestic) return;
    const ac = new AbortController();
    fetch("/api/mailing-options", { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => setOptions(d.destinations || []))
      .catch(() => {});
    return () => ac.abort();
  }, [domestic]);
  const set = (k: keyof Address, v: string) => onChange({ ...value, [k]: v });
  const dest = options.find((d) => d.countryCode === value.country);
  const effectiveCountry = domestic || !value.country ? "US" : value.country;
  return (
    <>
      {domestic ? (
        <p className="wed-meta">US return address</p>
      ) : (
        <label>
          Mailing country
          <select
            value={value.country}
            onChange={(e) =>
              onChange({ ...value, country: e.target.value, state: "" })
            }
          >
            <option value="">Choose country</option>
            <option value="US">United States</option>
            {value.country && value.country !== "US" && !dest && (
              <option value={value.country}>
                {value.country} · check availability
              </option>
            )}
            {options
              .filter((d) => d.available)
              .map((d) => (
                <option key={d.countryCode} value={d.countryCode}>
                  {d.countryName}
                </option>
              ))}
          </select>
        </label>
      )}
      {!domestic && value.country && value.country !== "US" && (
        <p className="wed-meta">
          +$5.00 international mailing per card. Delivery varies by country and
          local postal service.
        </p>
      )}
      <label>
        Street address
        <input
          value={value.address1 || ""}
          onChange={(e) => set("address1", e.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        Apartment, unit or additional line
        <input
          value={value.address2 || ""}
          onChange={(e) => set("address2", e.target.value)}
        />
      </label>
      <label>
        City or locality
        <input
          value={value.city || ""}
          onChange={(e) => set("city", e.target.value)}
        />
      </label>
      <div className="wed-mini-grid">
        <label>
          {effectiveCountry === "US"
            ? "State"
            : effectiveCountry === "CA"
              ? "Province"
              : "Region"}
          {dest?.regions?.length ? (
            <select
              value={value.state || ""}
              onChange={(e) => set("state", e.target.value)}
            >
              <option value="">Choose region</option>
              {dest.regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={value.state || ""}
              onChange={(e) => set("state", e.target.value)}
            />
          )}
        </label>
        <label>
          {effectiveCountry === "US" ? "ZIP code" : "Postal code"}
          <input
            value={value.zip || ""}
            onChange={(e) => set("zip", e.target.value)}
          />
        </label>
      </div>
    </>
  );
}
