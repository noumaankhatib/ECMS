import type { FieldIssue } from './api';

/**
 * Turns what the API said about a field into something a person can act on.
 *
 * The API reports a field by its code name (`firstName`, `surveyReference`)
 * and gives the validator's own wording ("Use at least 12 characters",
 * "Invalid input: expected string, received undefined"). Neither says WHICH
 * box on the page is meant or what to do about it, so both are rewritten here
 * — once, for every form — rather than field by field.
 */

/** Names the person sees on the page, where the code name would read oddly. */
const LABELS: Readonly<Record<string, string>> = {
  identifier: 'Username or email',
  firstName: 'Name',
  fatherName: "Father's name",
  grandfatherName: "Grandfather's name",
  surname: 'Surname',
  crNumber: 'CR number',
  civilId: 'Civil ID',
  mobileNumber: 'Mobile number',
  surveyReference: 'Krookie (survey reference)',
  titleDeedReference: 'Mulkia (title deed) reference',
  approxAreaSqm: 'Approximate area (m²)',
  plotNumber: 'Plot number',
  plotArea: 'Plot area',
  targetEndDate: 'Target end date',
  startDate: 'Start date',
  dueAt: 'Due date',
  receivedAt: 'Received date',
  contactName: 'Contact name',
  contactPhone: 'Contact phone',
  submittedBy: 'Submitted by',
  externalPlanningReference: 'Planning reference',
  clientId: 'Client',
  propertyId: 'Property',
  sketchTypeId: 'Sketch type',
  assignedArchitectId: 'Assigned architect',
};

/** `(body)` / `(query)` mean the pipe could not name a field; say nothing. */
export function fieldLabel(field: string): string {
  if (field.startsWith('(')) return '';
  const last =
    field
      .split('.')
      .filter((part) => !/^\d+$/.test(part))
      .pop() ?? field;
  const known = LABELS[last];
  if (known) return known;
  const words = last
    .replace(/Id$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The validator's wording, rewritten as an instruction. Anything already
 *  written for people (every message the contracts define) passes through. */
export function plainReason(reason: string): string {
  const r = reason.trim();

  if (/^required$/i.test(r) || /received (undefined|null)/i.test(r)) {
    return 'This is required. Fill it in.';
  }
  let m = /expected string to have >=\s*(\d+) characters/i.exec(r);
  if (m) {
    return m[1] === '1' ? 'This is required. Fill it in.' : `Use at least ${m[1]} characters.`;
  }
  m = /expected string to have <=\s*(\d+) characters/i.exec(r);
  if (m) return `Use no more than ${m[1]} characters.`;
  if (/expected number to be >\s*0/i.test(r)) return 'Enter a number greater than zero.';
  if (/expected number to be >=\s*(-?[\d.]+)/i.test(r)) {
    return `Enter a number of ${/>=\s*(-?[\d.]+)/.exec(r)?.[1]} or more.`;
  }
  if (/expected number, received (nan|string)/i.test(r) || /not a number/i.test(r)) {
    return 'Enter a number, using digits only.';
  }
  if (/invalid uuid/i.test(r)) {
    return 'Choose one of the suggestions from the list rather than typing it in.';
  }
  if (/invalid email/i.test(r)) return 'Enter a valid email address, like name@example.com.';
  if (/invalid option|expected one of/i.test(r)) return 'Choose one of the options offered.';
  if (/unrecognized key/i.test(r)) {
    return 'The form sent something the server does not accept. Reload the page and try again.';
  }
  if (/^invalid input/i.test(r)) {
    return 'This is not in a form we can accept. Check it and enter it again.';
  }
  return r.endsWith('.') || r.endsWith('?') ? r : `${r}.`;
}

export interface DescribedIssue {
  readonly label: string;
  readonly text: string;
}

export function describeIssue(issue: FieldIssue): DescribedIssue {
  return { label: fieldLabel(issue.field), text: plainReason(issue.reason) };
}
