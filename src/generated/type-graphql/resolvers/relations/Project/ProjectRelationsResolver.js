"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectRelationsResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileData_1 = require("../../../models/FileData");
const Project_1 = require("../../../models/Project");
const Tenant_1 = require("../../../models/Tenant");
const ProjectFilesArgs_1 = require("./args/ProjectFilesArgs");
const helpers_1 = require("../../../helpers");
let ProjectRelationsResolver = class ProjectRelationsResolver {
    async tenant(project, ctx, info) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).project.findUniqueOrThrow({
            where: {
                id: project.id,
            },
        }).tenant({
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async files(project, ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).project.findUniqueOrThrow({
            where: {
                id: project.id,
            },
        }).files({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.ProjectRelationsResolver = ProjectRelationsResolver;
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => Tenant_1.Tenant, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Project_1.Project, Object, Object]),
    tslib_1.__metadata("design:returntype", Promise)
], ProjectRelationsResolver.prototype, "tenant", null);
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => [FileData_1.FileData], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__param(3, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Project_1.Project, Object, Object, ProjectFilesArgs_1.ProjectFilesArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ProjectRelationsResolver.prototype, "files", null);
exports.ProjectRelationsResolver = ProjectRelationsResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Project_1.Project)
], ProjectRelationsResolver);
