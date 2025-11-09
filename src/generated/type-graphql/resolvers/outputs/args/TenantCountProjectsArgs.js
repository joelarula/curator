"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantCountProjectsArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ProjectWhereInput_1 = require("../../inputs/ProjectWhereInput");
let TenantCountProjectsArgs = class TenantCountProjectsArgs {
};
exports.TenantCountProjectsArgs = TenantCountProjectsArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ProjectWhereInput_1.ProjectWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ProjectWhereInput_1.ProjectWhereInput)
], TenantCountProjectsArgs.prototype, "where", void 0);
exports.TenantCountProjectsArgs = TenantCountProjectsArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], TenantCountProjectsArgs);
