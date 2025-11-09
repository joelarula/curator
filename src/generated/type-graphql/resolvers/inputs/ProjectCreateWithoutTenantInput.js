"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateWithoutTenantInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCreateNestedManyWithoutProjectInput_1 = require("../inputs/FileDataCreateNestedManyWithoutProjectInput");
let ProjectCreateWithoutTenantInput = class ProjectCreateWithoutTenantInput {
};
exports.ProjectCreateWithoutTenantInput = ProjectCreateWithoutTenantInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], ProjectCreateWithoutTenantInput.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateWithoutTenantInput.prototype, "createdAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Date, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Date)
], ProjectCreateWithoutTenantInput.prototype, "updatedAt", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => FileDataCreateNestedManyWithoutProjectInput_1.FileDataCreateNestedManyWithoutProjectInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", FileDataCreateNestedManyWithoutProjectInput_1.FileDataCreateNestedManyWithoutProjectInput)
], ProjectCreateWithoutTenantInput.prototype, "files", void 0);
exports.ProjectCreateWithoutTenantInput = ProjectCreateWithoutTenantInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateWithoutTenantInput", {})
], ProjectCreateWithoutTenantInput);
