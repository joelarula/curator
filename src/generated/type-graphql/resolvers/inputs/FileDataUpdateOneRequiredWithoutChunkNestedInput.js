"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateOneRequiredWithoutChunkNestedInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateOrConnectWithoutChunkInput_1 = require("../inputs/FileDataCreateOrConnectWithoutChunkInput");
const FileDataCreateWithoutChunkInput_1 = require("../inputs/FileDataCreateWithoutChunkInput");
const FileDataUpdateToOneWithWhereWithoutChunkInput_1 = require("../inputs/FileDataUpdateToOneWithWhereWithoutChunkInput");
const FileDataUpsertWithoutChunkInput_1 = require("../inputs/FileDataUpsertWithoutChunkInput");
const FileDataWhereUniqueInput_1 = require("../inputs/FileDataWhereUniqueInput");
let FileDataUpdateOneRequiredWithoutChunkNestedInput = class FileDataUpdateOneRequiredWithoutChunkNestedInput {
};
exports.FileDataUpdateOneRequiredWithoutChunkNestedInput = FileDataUpdateOneRequiredWithoutChunkNestedInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateWithoutChunkInput_1.FileDataCreateWithoutChunkInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCreateWithoutChunkInput_1.FileDataCreateWithoutChunkInput)
], FileDataUpdateOneRequiredWithoutChunkNestedInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateOrConnectWithoutChunkInput_1.FileDataCreateOrConnectWithoutChunkInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCreateOrConnectWithoutChunkInput_1.FileDataCreateOrConnectWithoutChunkInput)
], FileDataUpdateOneRequiredWithoutChunkNestedInput.prototype, "connectOrCreate", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpsertWithoutChunkInput_1.FileDataUpsertWithoutChunkInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataUpsertWithoutChunkInput_1.FileDataUpsertWithoutChunkInput)
], FileDataUpdateOneRequiredWithoutChunkNestedInput.prototype, "upsert", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], FileDataUpdateOneRequiredWithoutChunkNestedInput.prototype, "connect", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateToOneWithWhereWithoutChunkInput_1.FileDataUpdateToOneWithWhereWithoutChunkInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataUpdateToOneWithWhereWithoutChunkInput_1.FileDataUpdateToOneWithWhereWithoutChunkInput)
], FileDataUpdateOneRequiredWithoutChunkNestedInput.prototype, "update", void 0);
exports.FileDataUpdateOneRequiredWithoutChunkNestedInput = FileDataUpdateOneRequiredWithoutChunkNestedInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateOneRequiredWithoutChunkNestedInput", {})
], FileDataUpdateOneRequiredWithoutChunkNestedInput);
