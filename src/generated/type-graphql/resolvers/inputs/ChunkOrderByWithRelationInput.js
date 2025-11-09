"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkOrderByWithRelationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataOrderByWithRelationInput_1 = require("../inputs/FileDataOrderByWithRelationInput");
const ModelOrderByWithRelationInput_1 = require("../inputs/ModelOrderByWithRelationInput");
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let ChunkOrderByWithRelationInput = class ChunkOrderByWithRelationInput {
};
exports.ChunkOrderByWithRelationInput = ChunkOrderByWithRelationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithRelationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithRelationInput.prototype, "text", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithRelationInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], ChunkOrderByWithRelationInput.prototype, "selection", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithRelationInput.prototype, "fileId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ChunkOrderByWithRelationInput.prototype, "modelId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataOrderByWithRelationInput_1.FileDataOrderByWithRelationInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataOrderByWithRelationInput_1.FileDataOrderByWithRelationInput)
], ChunkOrderByWithRelationInput.prototype, "file", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelOrderByWithRelationInput_1.ModelOrderByWithRelationInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelOrderByWithRelationInput_1.ModelOrderByWithRelationInput)
], ChunkOrderByWithRelationInput.prototype, "model", void 0);
exports.ChunkOrderByWithRelationInput = ChunkOrderByWithRelationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkOrderByWithRelationInput", {})
], ChunkOrderByWithRelationInput);
