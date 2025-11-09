"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateManyTenantInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let ProjectCreateManyTenantInput = class ProjectCreateManyTenantInput {
};
exports.ProjectCreateManyTenantInput = ProjectCreateManyTenantInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Number)
], ProjectCreateManyTenantInput.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ProjectCreateManyTenantInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateManyTenantInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateManyTenantInput.prototype, "updatedAt", void 0);
exports.ProjectCreateManyTenantInput = ProjectCreateManyTenantInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateManyTenantInput", {})
], ProjectCreateManyTenantInput);
