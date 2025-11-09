"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantCreateInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateNestedManyWithoutTenantInput_1 = require("../inputs/ProjectCreateNestedManyWithoutTenantInput");
let TenantCreateInput = class TenantCreateInput {
};
exports.TenantCreateInput = TenantCreateInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], TenantCreateInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], TenantCreateInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], TenantCreateInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectCreateNestedManyWithoutTenantInput_1.ProjectCreateNestedManyWithoutTenantInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectCreateNestedManyWithoutTenantInput_1.ProjectCreateNestedManyWithoutTenantInput)
], TenantCreateInput.prototype, "projects", void 0);
exports.TenantCreateInput = TenantCreateInput = tslib_1.__decorate([
    TypeGraphQL.InputType("TenantCreateInput", {})
], TenantCreateInput);
