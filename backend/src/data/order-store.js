/**
 * TicketFlow - Shared In-Memory Store for Orders and Attendees
 * Provides fallback in-memory state when database operations are bypassed in testing
 * or during transient transitions.
 */

export const memoryOrders = new Map();
export const memoryAttendees = new Map();

let nextOrderId = 100;
let nextAttendeeId = 200;

export function getNextOrderId() {
  return nextOrderId++;
}

export function getNextAttendeeId() {
  return nextAttendeeId++;
}
