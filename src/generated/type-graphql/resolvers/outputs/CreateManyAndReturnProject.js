"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnProject = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const Tenant_1 = require("../../models/Tenant");
let CreateManyAndReturnProject = class CreateManyAndReturnProject {
};
exports.CreateManyAndReturnProject = CreateManyAndReturnProject;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], CreateManyAndReturnProject.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], CreateManyAndReturnProject.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], CreateManyAndReturnProject.prototype, "tenantId", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Date)
], CreateManyAndReturnProject.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Date)
], CreateManyAndReturnProject.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Tenant_1.Tenant, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Tenant_1.Tenant)
], CreateManyAndReturnProject.prototype, "tenant", void 0);
exports.CreateManyAndReturnProject = CreateManyAndReturnProject = tslib_1.__decorate([
    TypeGraphQL.ObjectType("CreateManyAndReturnProject", {})
], CreateManyAndReturnProject);
