"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantWhereUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const ProjectListRelationFilter_1 = require("../inputs/ProjectListRelationFilter");
const TenantWhereInput_1 = require("../inputs/TenantWhereInput");
let TenantWhereUniqueInput = class TenantWhereUniqueInput {
};
exports.TenantWhereUniqueInput = TenantWhereUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], TenantWhereUniqueInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], TenantWhereUniqueInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantWhereInput_1.TenantWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], TenantWhereUniqueInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantWhereInput_1.TenantWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], TenantWhereUniqueInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [TenantWhereInput_1.TenantWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], TenantWhereUniqueInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], TenantWhereUniqueInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], TenantWhereUniqueInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectListRelationFilter_1.ProjectListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectListRelationFilter_1.ProjectListRelationFilter)
], TenantWhereUniqueInput.prototype, "projects", void 0);
exports.TenantWhereUniqueInput = TenantWhereUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantWhereUniqueInput", {})
], TenantWhereUniqueInput);
