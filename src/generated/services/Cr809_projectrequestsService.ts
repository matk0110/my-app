/*!
 * Scaffolded service for cr809_projectrequests.
 */

import type { Cr809_projectrequestsBase, Cr809_projectrequests } from '../models/Cr809_projectrequestsModel';
import type { IGetOptions, IGetAllOptions } from '../models/CommonModels';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';
import { getClient } from '@microsoft/power-apps/data';

export class Cr809_projectrequestsService {
  private static readonly dataSourceName = 'cr809_projectrequests';

  private static readonly client = getClient(dataSourcesInfo);

  public static async create(
    record: Omit<Cr809_projectrequestsBase, 'cr809_projectrequestid'>,
  ): Promise<IOperationResult<Cr809_projectrequests>> {
    return Cr809_projectrequestsService.client.createRecordAsync<
      Omit<Cr809_projectrequestsBase, 'cr809_projectrequestid'>,
      Cr809_projectrequests
    >(Cr809_projectrequestsService.dataSourceName, record);
  }

  public static async update(
    id: string,
    changedFields: Partial<Omit<Cr809_projectrequestsBase, 'cr809_projectrequestid'>>,
  ): Promise<IOperationResult<Cr809_projectrequests>> {
    return Cr809_projectrequestsService.client.updateRecordAsync<
      Partial<Omit<Cr809_projectrequestsBase, 'cr809_projectrequestid'>>,
      Cr809_projectrequests
    >(Cr809_projectrequestsService.dataSourceName, id, changedFields);
  }

  public static async delete(id: string): Promise<void> {
    await Cr809_projectrequestsService.client.deleteRecordAsync(
      Cr809_projectrequestsService.dataSourceName,
      id,
    );
  }

  public static async get(
    id: string,
    options?: IGetOptions,
  ): Promise<IOperationResult<Cr809_projectrequests>> {
    return Cr809_projectrequestsService.client.retrieveRecordAsync<Cr809_projectrequests>(
      Cr809_projectrequestsService.dataSourceName,
      id,
      options,
    );
  }

  public static async getAll(
    options?: IGetAllOptions,
  ): Promise<IOperationResult<Cr809_projectrequests[]>> {
    return Cr809_projectrequestsService.client.retrieveMultipleRecordsAsync<Cr809_projectrequests>(
      Cr809_projectrequestsService.dataSourceName,
      options,
    );
  }
}
