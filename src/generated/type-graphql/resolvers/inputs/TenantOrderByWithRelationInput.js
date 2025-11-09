"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantOrderByWithRelationInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectOrderByRelationAggregateInput_1 = require("../inputs/ProjectOrderByRelationAggregateInput");
const SortOrder_1 = require("../../enums/SortOrder");
let TenantOrderByWithRelationInput = class TenantOrderByWithRelationInput {
};
exports.TenantOrderByWithRelationInput = TenantOrderByWithRelationInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithRelationInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithRelationInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithRelationInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => SortOrder_1.SortOrder, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantOrderByWithRelationInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectOrderByRelationAggregateInput_1.ProjectOrderByRelationAggregateInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectOrderByRelationAggregateInput_1.ProjectOrderByRelationAggregateInput)
], TenantOrderByWithRelationInput.prototype, "projects", void 0);
exports.TenantOrderByWithRelationInput = TenantOrderByWithRelationInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantOrderByWithRelationInput", {})
], TenantOrderByWithRelationInput);
