"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataUpdateToOneWithWhereWithoutChunkInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataUpdateWithoutChunkInput_1 = require("../inputs/FileDataUpdateWithoutChunkInput");
const FileDataWhereInput_1 = require("../inputs/FileDataWhereInput");
let FileDataUpdateToOneWithWhereWithoutChunkInput = class FileDataUpdateToOneWithWhereWithoutChunkInput {
};
exports.FileDataUpdateToOneWithWhereWithoutChunkInput = FileDataUpdateToOneWithWhereWithoutChunkInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereInput_1.FileDataWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataWhereInput_1.FileDataWhereInput)
], FileDataUpdateToOneWithWhereWithoutChunkInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataUpdateWithoutChunkInput_1.FileDataUpdateWithoutChunkInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataUpdateWithoutChunkInput_1.FileDataUpdateWithoutChunkInput)
], FileDataUpdateToOneWithWhereWithoutChunkInput.prototype, "data", void 0);
exports.FileDataUpdateToOneWithWhereWithoutChunkInput = FileDataUpdateToOneWithWhereWithoutChunkInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataUpdateToOneWithWhereWithoutChunkInput", {})
], FileDataUpdateToOneWithWhereWithoutChunkInput);
