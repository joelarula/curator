"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpsertWithoutChunkInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateWithoutChunkInput_1 = require("../inputs/FileDataCreateWithoutChunkInput");
const FileDataUpdateWithoutChunkInput_1 = require("../inputs/FileDataUpdateWithoutChunkInput");
const FileDataWhereInput_1 = require("../inputs/FileDataWhereInput");
let FileDataUpsertWithoutChunkInput = class FileDataUpsertWithoutChunkInput {
};
exports.FileDataUpsertWithoutChunkInput = FileDataUpsertWithoutChunkInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateWithoutChunkInput_1.FileDataUpdateWithoutChunkInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataUpdateWithoutChunkInput_1.FileDataUpdateWithoutChunkInput)
], FileDataUpsertWithoutChunkInput.prototype, "update", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateWithoutChunkInput_1.FileDataCreateWithoutChunkInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataCreateWithoutChunkInput_1.FileDataCreateWithoutChunkInput)
], FileDataUpsertWithoutChunkInput.prototype, "create", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FileDataUpsertWithoutChunkInput.prototype, "where", void 0);
exports.FileDataUpsertWithoutChunkInput = FileDataUpsertWithoutChunkInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpsertWithoutChunkInput", {})
], FileDataUpsertWithoutChunkInput);
