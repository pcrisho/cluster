import { Global, Module } from "@nestjs/common"
import { StorageService } from "./storage.service"
import { FilesController } from "./files.controller"
import { FileAccessRegistry } from "./file-access.registry"
import { UploadGate } from "./upload-gate"
import { UploadTempSweeper } from "./upload-temp"

/** Core object storage, shared by every module (registered once). */
@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, FileAccessRegistry, UploadTempSweeper, UploadGate],
  exports: [StorageService, FileAccessRegistry, UploadGate],
})
export class StorageModule {}
