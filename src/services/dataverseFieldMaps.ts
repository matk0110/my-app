/*!
 * Field mapping utilities for Dataverse write operations.
 * Maps human-friendly input types to Dataverse field names and formats.
 */

import type {
  Cr809_activitiesBase,
  Cr809_activitiescr809_status,
} from '../generated/models/Cr809_activitiesModel';
import type {
  Cr809_assetsBase,
  Cr809_assetscr809_assettype,
  Cr809_assetscr809_status,
} from '../generated/models/Cr809_assetsModel';
import type {
  Cr809_projectsBase,
  Cr809_projectscr809_status,
} from '../generated/models/Cr809_projectsModel';

// ============================================================================
// STATUS ENUM MAPPINGS
// ============================================================================

export const ActivityStatus = {
  NotStarted: 804270000,
  InProgress: 804270001,
  Completed: 804270002,
  Blocked: 804270003,
} as const;
export type ActivityStatusKey = keyof typeof ActivityStatus;

export const AssetStatus = {
  Active: 804270000,
  Inactive: 804270001,
  Retired: 804270002,
  Maintenance: 804270003,
} as const;
export type AssetStatusKey = keyof typeof AssetStatus;

export const AssetType = {
  Equipment: 804270000,
  Vehicle: 804270001,
  Facility: 804270002,
  Software: 804270003,
  Other: 804270004,
} as const;
export type AssetTypeKey = keyof typeof AssetType;

export const ProjectStatus = {
  Planning: 804270000,
  InProgress: 804270001,
  OnHold: 804270002,
  Completed: 804270003,
  Cancelled: 804270004,
} as const;
export type ProjectStatusKey = keyof typeof ProjectStatus;

// ============================================================================
// INPUT TYPES (Human-friendly)
// ============================================================================

export interface CreateActivityInput {
  name: string;
  startDate?: Date;
  endDate?: Date;
  dueDate?: Date;
  duration?: string;
  progress?: number;
  status: ActivityStatusKey;
  comments?: string;
  deliverables?: string;
  sequence?: string;
  isVendorActivity?: boolean;
  assetId?: string;
}

export interface ActivityUpdateFields {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  dueDate?: Date;
  duration?: string;
  progress?: number;
  status?: ActivityStatusKey;
  comments?: string;
  deliverables?: string;
  sequence?: string;
  isVendorActivity?: boolean;
  assetId?: string;
}

export interface CreateAssetInput {
  name: string;
  assetType: AssetTypeKey;
  status: AssetStatusKey;
  description?: string;
  location?: string;
  serialNumber?: string;
  startDate?: Date;
  endDate?: Date;
  progress?: number;
  projectId?: string;
}

export interface AssetUpdateFields {
  name?: string;
  assetType?: AssetTypeKey;
  status?: AssetStatusKey;
  description?: string;
  location?: string;
  serialNumber?: string;
  startDate?: Date;
  endDate?: Date;
  progress?: number;
  projectId?: string;
}

export interface ProjectUpdateFields {
  name?: string;
  description?: string;
  status?: ProjectStatusKey;
  startDate?: Date;
  endDate?: Date;
  progress?: number;
  riskLevel?: string;
}

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

export function mapActivityToDataverse(
  input: CreateActivityInput | ActivityUpdateFields
): Partial<Omit<Cr809_activitiesBase, 'cr809_activityid'>> {
  const mapped: Partial<Omit<Cr809_activitiesBase, 'cr809_activityid'>> = {};

  if ('name' in input && input.name !== undefined) {
    mapped.cr809_activityname = input.name;
  }
  if (input.startDate !== undefined) {
    mapped.cr809_startdate = input.startDate.toISOString();
  }
  if (input.endDate !== undefined) {
    mapped.cr809_enddate = input.endDate.toISOString();
  }
  if (input.dueDate !== undefined) {
    mapped.cr809_duedate = input.dueDate.toISOString();
  }
  if (input.duration !== undefined) {
    mapped.cr809_duration = input.duration;
  }
  if (input.progress !== undefined) {
    mapped.cr809_progress = input.progress;
  }
  if (input.status !== undefined) {
    mapped.cr809_status = ActivityStatus[input.status] as Cr809_activitiescr809_status;
  }
  if (input.comments !== undefined) {
    mapped.cr809_comments = input.comments;
  }
  if (input.deliverables !== undefined) {
    mapped.cr809_deliverables = input.deliverables;
  }
  if (input.sequence !== undefined) {
    mapped.cr809_sequence = input.sequence;
  }
  if (input.isVendorActivity !== undefined) {
    mapped.cr809_isvendoractivity = input.isVendorActivity ? 1 : 0;
  }
  if (input.assetId !== undefined) {
    mapped['cr809_Asset@odata.bind'] = `/cr809_assets(${input.assetId})`;
  }

  return mapped;
}

export function mapAssetToDataverse(
  input: CreateAssetInput | AssetUpdateFields
): Partial<Omit<Cr809_assetsBase, 'cr809_assetid'>> {
  const mapped: Partial<Omit<Cr809_assetsBase, 'cr809_assetid'>> = {};

  if ('name' in input && input.name !== undefined) {
    mapped.cr809_assetname = input.name;
  }
  if ('assetType' in input && input.assetType !== undefined) {
    mapped.cr809_assettype = AssetType[input.assetType] as Cr809_assetscr809_assettype;
  }
  if (input.status !== undefined) {
    mapped.cr809_status = AssetStatus[input.status] as Cr809_assetscr809_status;
  }
  if (input.description !== undefined) {
    mapped.cr809_description = input.description;
  }
  if (input.location !== undefined) {
    mapped.cr809_location = input.location;
  }
  if (input.serialNumber !== undefined) {
    mapped.cr809_serialnumber = input.serialNumber;
  }
  if (input.startDate !== undefined) {
    mapped.cr809_startdate = input.startDate.toISOString();
  }
  if (input.endDate !== undefined) {
    mapped.cr809_enddate = input.endDate.toISOString();
  }
  if (input.progress !== undefined) {
    mapped.cr809_progress = input.progress;
  }
  if (input.projectId !== undefined) {
    mapped['cr809_Project@odata.bind'] = `/cr809_projects(${input.projectId})`;
  }

  return mapped;
}

export function mapProjectToDataverse(
  input: ProjectUpdateFields
): Partial<Omit<Cr809_projectsBase, 'cr809_projectid'>> {
  const mapped: Partial<Omit<Cr809_projectsBase, 'cr809_projectid'>> = {};

  if (input.name !== undefined) {
    mapped.cr809_projectname = input.name;
  }
  if (input.description !== undefined) {
    mapped.cr809_description = input.description;
  }
  if (input.status !== undefined) {
    mapped.cr809_status = ProjectStatus[input.status] as Cr809_projectscr809_status;
  }
  if (input.startDate !== undefined) {
    mapped.cr809_startdate = input.startDate.toISOString();
  }
  if (input.endDate !== undefined) {
    mapped.cr809_enddate = input.endDate.toISOString();
  }
  if (input.progress !== undefined) {
    mapped.cr809_progress = input.progress;
  }
  if (input.riskLevel !== undefined) {
    mapped.cr809_risklevel = input.riskLevel;
  }

  return mapped;
}
