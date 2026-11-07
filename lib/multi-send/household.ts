export interface HouseholdAcknowledgement {
  id: string;
  addressKey: string;
}

export interface HouseholdAckRecipient {
  id: string;
  householdAcknowledgedWith?: HouseholdAcknowledgement[];
}

/** Replace only the edited recipient's pair links, keeping unrelated household acknowledgments. */
export function setHouseholdAcknowledgements<T extends HouseholdAckRecipient>(
  recipients: T[],
  recipientId: string,
  peerIds: string[],
  addressKey: string,
): T[] {
  const peers = new Set(peerIds.filter((id) => id !== recipientId));
  return recipients.map((recipient) => {
    const retained = recipient.id === recipientId
      ? []
      : (recipient.householdAcknowledgedWith || []).filter((ack) => ack.id !== recipientId);
    const additions = recipient.id === recipientId
      ? [...peers].map((id) => ({ id, addressKey }))
      : peers.has(recipient.id) ? [{ id: recipientId, addressKey }] : [];
    return { ...recipient, householdAcknowledgedWith: [...retained, ...additions] };
  });
}
