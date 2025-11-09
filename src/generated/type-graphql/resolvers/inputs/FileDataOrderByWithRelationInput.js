"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataOrderByWithRelationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkOrderByRelationAggregateInput_1 = require("../inputs/ChunkOrderByRelationAggregateInput");
const ProjectOrderByWithRelationInput_1 = require("../inputs/ProjectOrderByWithRelationInput");
const SortOrderInput_1 = require("../inputs/SortOrderInput");
const SortOrder_1 = require("../../enums/SortOrder");
let FileDataOrderByWithRelationInput = class FileDataOrderByWithRelationInput {
};
exports.FileDataOrderByWithRelationInput = FileDataOrderByWithRelationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "mimeType", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], FileDataOrderByWithRelationInput.prototype, "source", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "hash", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "size", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrderInput_1.SortOrderInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", SortOrderInput_1.SortOrderInput)
], FileDataOrderByWithRelationInput.prototype, "content", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "projectId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], FileDataOrderByWithRelationInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectOrderByWithRelationInput_1.ProjectOrderByWithRelationInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectOrderByWithRelationInput_1.ProjectOrderByWithRelationInput)
], FileDataOrderByWithRelationInput.prototype, "project", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkOrderByRelationAggregateInput_1.ChunkOrderByRelationAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkOrderByRelationAggregateInput_1.ChunkOrderByRelationAggregateInput)
], FileDataOrderByWithRelationInput.prototype, "Chunk", void 0);
exports.FileDataOrderByWithRelationInput = FileDataOrderByWithRelationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("FileDataOrderByWithRelationInput", {})
], FileDataOrderByWithRelationInput);
