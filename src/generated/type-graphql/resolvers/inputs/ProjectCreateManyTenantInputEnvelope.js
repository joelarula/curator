"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectCreateManyTenantInputEnvelope = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectCreateManyTenantInput_1 = require("../inputs/ProjectCreateManyTenantInput");
let ProjectCreateManyTenantInputEnvelope = class ProjectCreateManyTenantInputEnvelope {
};
exports.ProjectCreateManyTenantInputEnvelope = ProjectCreateManyTenantInputEnvelope;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ProjectCreateManyTenantInput_1.ProjectCreateManyTenantInput], {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Array)
], ProjectCreateManyTenantInputEnvelope.prototype, "data", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => Boolean, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Boolean)
], ProjectCreateManyTenantInputEnvelope.prototype, "skipDuplicates", void 0);
exports.ProjectCreateManyTenantInputEnvelope = ProjectCreateManyTenantInputEnvelope = tslib_1.__decorate([
    TypeGraphQL.InputType("ProjectCreateManyTenantInputEnvelope", {})
], ProjectCreateManyTenantInputEnvelope);
