"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const ProjectListRelationFilter_1 = require("../inputs/ProjectListRelationFilter");
const StringFilter_1 = require("../inputs/StringFilter");
let TenantWhereInput = class TenantWhereInput {
};
exports.TenantWhereInput = TenantWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], TenantWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], TenantWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], TenantWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], TenantWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], TenantWhereInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], TenantWhereInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], TenantWhereInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectListRelationFilter_1.ProjectListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectListRelationFilter_1.ProjectListRelationFilter)
], TenantWhereInput.prototype, "projects", void 0);
exports.TenantWhereInput = TenantWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantWhereInput", {})
], TenantWhereInput);
