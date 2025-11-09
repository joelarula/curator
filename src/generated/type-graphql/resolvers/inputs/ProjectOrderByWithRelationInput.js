"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectOrderByWithRelationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataOrderByRelationAggregateInput_1 = require("../inputs/FileDataOrderByRelationAggregateInput");
const TenantOrderByWithRelationInput_1 = require("../inputs/TenantOrderByWithRelationInput");
const SortOrder_1 = require("../../enums/SortOrder");
let ProjectOrderByWithRelationInput = class ProjectOrderByWithRelationInput {
};
exports.ProjectOrderByWithRelationInput = ProjectOrderByWithRelationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ProjectOrderByWithRelationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ProjectOrderByWithRelationInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ProjectOrderByWithRelationInput.prototype, "tenantId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ProjectOrderByWithRelationInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ProjectOrderByWithRelationInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantOrderByWithRelationInput_1.TenantOrderByWithRelationInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantOrderByWithRelationInput_1.TenantOrderByWithRelationInput)
], ProjectOrderByWithRelationInput.prototype, "tenant", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataOrderByRelationAggregateInput_1.FileDataOrderByRelationAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataOrderByRelationAggregateInput_1.FileDataOrderByRelationAggregateInput)
], ProjectOrderByWithRelationInput.prototype, "files", void 0);
exports.ProjectOrderByWithRelationInput = ProjectOrderByWithRelationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectOrderByWithRelationInput", {})
], ProjectOrderByWithRelationInput);
