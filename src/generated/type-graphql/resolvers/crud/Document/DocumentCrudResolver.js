"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentCrudResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateDocumentArgs_1 = require("./args/AggregateDocumentArgs");
const CreateManyAndReturnDocumentArgs_1 = require("./args/CreateManyAndReturnDocumentArgs");
const CreateManyDocumentArgs_1 = require("./args/CreateManyDocumentArgs");
const CreateOneDocumentArgs_1 = require("./args/CreateOneDocumentArgs");
const DeleteManyDocumentArgs_1 = require("./args/DeleteManyDocumentArgs");
const DeleteOneDocumentArgs_1 = require("./args/DeleteOneDocumentArgs");
const FindFirstDocumentArgs_1 = require("./args/FindFirstDocumentArgs");
const FindFirstDocumentOrThrowArgs_1 = require("./args/FindFirstDocumentOrThrowArgs");
const FindManyDocumentArgs_1 = require("./args/FindManyDocumentArgs");
const FindUniqueDocumentArgs_1 = require("./args/FindUniqueDocumentArgs");
const FindUniqueDocumentOrThrowArgs_1 = require("./args/FindUniqueDocumentOrThrowArgs");
const GroupByDocumentArgs_1 = require("./args/GroupByDocumentArgs");
const UpdateManyDocumentArgs_1 = require("./args/UpdateManyDocumentArgs");
const UpdateOneDocumentArgs_1 = require("./args/UpdateOneDocumentArgs");
const UpsertOneDocumentArgs_1 = require("./args/UpsertOneDocumentArgs");
const helpers_1 = require("../../../helpers");
const Document_1 = require("../../../models/Document");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const AggregateDocument_1 = require("../../outputs/AggregateDocument");
const CreateManyAndReturnDocument_1 = require("../../outputs/CreateManyAndReturnDocument");
const DocumentGroupBy_1 = require("../../outputs/DocumentGroupBy");
let DocumentCrudResolver = class DocumentCrudResolver {
    async aggregateDocument(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).document.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
    async createManyDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.createMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createManyAndReturnDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.create({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteManyDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstDocumentOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async documents(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async document(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async getDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async groupByDocument(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
    async updateManyDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async updateOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async upsertOneDocument(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).document.upsert({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DocumentCrudResolver = DocumentCrudResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateDocument_1.AggregateDocument, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateDocumentArgs_1.AggregateDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "aggregateDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyDocumentArgs_1.CreateManyDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "createManyDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => [CreateManyAndReturnDocument_1.CreateManyAndReturnDocument], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyAndReturnDocumentArgs_1.CreateManyAndReturnDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "createManyAndReturnDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateOneDocumentArgs_1.CreateOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "createOneDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyDocumentArgs_1.DeleteManyDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "deleteManyDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneDocumentArgs_1.DeleteOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "deleteOneDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstDocumentArgs_1.FindFirstDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "findFirstDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstDocumentOrThrowArgs_1.FindFirstDocumentOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "findFirstDocumentOrThrow", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [Document_1.Document], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyDocumentArgs_1.FindManyDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "documents", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueDocumentArgs_1.FindUniqueDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "document", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueDocumentOrThrowArgs_1.FindUniqueDocumentOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "getDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [DocumentGroupBy_1.DocumentGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByDocumentArgs_1.GroupByDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "groupByDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateManyDocumentArgs_1.UpdateManyDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "updateManyDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneDocumentArgs_1.UpdateOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "updateOneDocument", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Document_1.Document, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpsertOneDocumentArgs_1.UpsertOneDocumentArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DocumentCrudResolver.prototype, "upsertOneDocument", null);
exports.DocumentCrudResolver = DocumentCrudResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Document_1.Document)
], DocumentCrudResolver);
