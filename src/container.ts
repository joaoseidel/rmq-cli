import { CompositeBrokerClient } from "./adapters/rabbitmq/composite-client.ts";
import { BackedUpOperationCoordinator } from "./adapters/storage/backed-up-operation-coordinator.ts";
import { JsonConfigurationStore } from "./adapters/storage/json-configuration-store.ts";
import { JsonMessageBackupRepository } from "./adapters/storage/json-message-backup-repository.ts";
import { JsonSettingsStore } from "./adapters/storage/json-settings-store.ts";
import { FileKeySecretCipher } from "./adapters/storage/secret-cipher.ts";
import type { BrokerClient } from "./core/ports/broker.ts";
import { ConnectionOperations } from "./core/usecase/connection-operations.ts";
import { JobManager } from "./core/usecase/jobs.ts";
import { MessageOperations } from "./core/usecase/message-operations.ts";
import { QueueOperations } from "./core/usecase/queue-operations.ts";
import { VHostOperations } from "./core/usecase/vhost-operations.ts";

export interface Container {
  readonly broker: BrokerClient;
  readonly connections: ConnectionOperations;
  readonly queues: QueueOperations;
  readonly messages: MessageOperations;
  readonly vhosts: VHostOperations;
  readonly jobs: JobManager;
}

export function createContainer(): Container {
  const settings = new JsonSettingsStore();
  const backupSettings = new JsonSettingsStore({
    fileName: "message_backup_operations",
  });

  const broker = new CompositeBrokerClient();
  const configStore = new JsonConfigurationStore(
    settings,
    new FileKeySecretCipher(),
  );
  const coordinator = new BackedUpOperationCoordinator(
    new JsonMessageBackupRepository(backupSettings),
  );

  return {
    broker,
    connections: new ConnectionOperations(configStore, broker),
    queues: new QueueOperations(broker, coordinator),
    messages: new MessageOperations(broker, coordinator),
    vhosts: new VHostOperations(broker, configStore),
    jobs: new JobManager(),
  };
}
