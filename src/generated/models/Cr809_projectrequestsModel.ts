/*!
 * Scaffolded model for cr809_projectrequests.
 * Fields marked optional may or may not exist — update once actual schema is confirmed.
 */

export interface Cr809_projectrequestsBase {
  cr809_projectrequestid: string;
  cr809_projectrequestname: string;
  cr809_description?: string;
  cr809_requestedstartdate?: string;
  cr809_requestedenddate?: string;
  cr809_status?: string;
  cr809_priority?: string;
  cr809_requestorname?: string;
  cr809_businessjustification?: string;
  cr809_estimatedbudget?: number;
  cr809_requestdate?: string;
  ownerid?: string;
  owneridtype?: string;
  statecode?: number;
  statuscode?: number;
}

/** Full read model — includes all base fields plus system/audit fields returned by Dataverse */
export interface Cr809_projectrequests extends Cr809_projectrequestsBase {
  createdon?: string;
  modifiedon?: string;
  createdbyname?: string;
  modifiedbyname?: string;
  owneridname?: string;
  versionnumber?: string;
  statecodename?: string;
  statuscodename?: string;
  /** Catch-all for any additional fields the entity exposes */
  [key: string]: unknown;
}
