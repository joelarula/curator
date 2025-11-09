"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCreateOrConnectWithoutChunkInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateWithoutChunkInput_1 = require("../inputs/FileDataCreateWithoutChunkInput");
const FileDataWhereUniqueInput_1 = require("../inputs/FileDataWhereUniqueInput");
let FileDataCreateOrConnectWithoutChunkInput = class FileDataCreateOrConnectWithoutChunkInput {
};
exports.FileDataCreateOrConnectWithoutChunkInput = FileDataCreateOrConnectWithoutChunkInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataWhereUniqueInput_1.FileDataWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataWhereUniqueInput_1.FileDataWhereUniqueInput)
], FileDataCreateOrConnectWithoutChunkInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateWithoutChunkInput_1.FileDataCreateWithoutChunkInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", FileDataCreateWithoutChunkInput_1.FileDataCreateWithoutChunkInput)
], FileDataCreateOrConnectWithoutChunkInput.prototype, "create", void 0);
exports.FileDataCreateOrConnectWithoutChunkInput = FileDataCreateOrConnectWithoutChunkInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataCreateOrConnectWithoutChunkInput", {})
], FileDataCreateOrConnectWithoutChunkInput);
