"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectWhereUniqueInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const FileDataListRelationFilter_1 = require("../inputs/FileDataListRelationFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const ProjectWhereInput_1 = require("../inputs/ProjectWhereInput");
const TenantRelationFilter_1 = require("../inputs/TenantRelationFilter");
let ProjectWhereUniqueInput = class ProjectWhereUniqueInput {
};
exports.ProjectWhereUniqueInput = ProjectWhereUniqueInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ProjectWhereUniqueInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], ProjectWhereUniqueInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereInput_1.ProjectWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectWhereUniqueInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereInput_1.ProjectWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectWhereUniqueInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereInput_1.ProjectWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectWhereUniqueInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ProjectWhereUniqueInput.prototype, "tenantId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], ProjectWhereUniqueInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], ProjectWhereUniqueInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantRelationFilter_1.TenantRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantRelationFilter_1.TenantRelationFilter)
], ProjectWhereUniqueInput.prototype, "tenant", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataListRelationFilter_1.FileDataListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataListRelationFilter_1.FileDataListRelationFilter)
], ProjectWhereUniqueInput.prototype, "files", void 0);
exports.ProjectWhereUniqueInput = ProjectWhereUniqueInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectWhereUniqueInput", {})
], ProjectWhereUniqueInput);
