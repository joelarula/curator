"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectWhereInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DateTimeFilter_1 = require("../inputs/DateTimeFilter");
const FileDataListRelationFilter_1 = require("../inputs/FileDataListRelationFilter");
const IntFilter_1 = require("../inputs/IntFilter");
const StringFilter_1 = require("../inputs/StringFilter");
const TenantRelationFilter_1 = require("../inputs/TenantRelationFilter");
let ProjectWhereInput = class ProjectWhereInput {
};
exports.ProjectWhereInput = ProjectWhereInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectWhereInput.prototype, "AND", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectWhereInput.prototype, "OR", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectWhereInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectWhereInput.prototype, "NOT", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ProjectWhereInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => StringFilter_1.StringFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", StringFilter_1.StringFilter)
], ProjectWhereInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => IntFilter_1.IntFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", IntFilter_1.IntFilter)
], ProjectWhereInput.prototype, "tenantId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], ProjectWhereInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => DateTimeFilter_1.DateTimeFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", DateTimeFilter_1.DateTimeFilter)
], ProjectWhereInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TenantRelationFilter_1.TenantRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", TenantRelationFilter_1.TenantRelationFilter)
], ProjectWhereInput.prototype, "tenant", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataListRelationFilter_1.FileDataListRelationFilter, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataListRelationFilter_1.FileDataListRelationFilter)
], ProjectWhereInput.prototype, "files", void 0);
exports.ProjectWhereInput = ProjectWhereInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectWhereInput", {})
], ProjectWhereInput);
